const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_relook_2026';

// --- PLUGGABLE ATS PROVIDERS ---
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const ProviderRegistry = require('./src/providers/ProviderRegistry');
const POPULAR_GREENHOUSE_COMPANIES = ['stripe', 'dropbox', 'deliveroo', 'vimeo', 'amplitude'];
const POPULAR_LEVER_COMPANIES = ['kinsta', 'aircall', 'palantir'];

// --- COMPANY DISCOVERY SERVICES ---
const Company = require('./src/models/Company');
const CompanyDiscoveryService = require('./src/services/CompanyDiscoveryService');

// --- DATABASE JOBS AND BACKGROUND WORKERS ---
const DbJob = require('./src/models/DbJob');
const BackgroundWorkers = require('./src/workers/BackgroundWorkers');
const CacheService = require('./src/services/CacheService');
const AiMatchingService = require('./src/services/AiMatchingService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- STRIPE PAYMENTS INTERFACE ---
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Stripe Webhook Endpoint (Must be parsed as raw body before express.json() middleware)
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (stripe && endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, creditsToAdd, newPlan } = session.metadata;

    if (userId && creditsToAdd) {
      try {
        const user = await User.findOne({ id: userId });
        if (user) {
          user.credit += Number(creditsToAdd);
          if (newPlan) user.plan = newPlan;
          await user.save();
          console.log(`Stripe: Successfully credited ${creditsToAdd} tokens to ${userId}`);
        }
      } catch (err) {
        console.error('Error updating user credits via Stripe webhook:', err);
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- MONGODB DATABASE SETUP ---
const mongoose = require('mongoose');

if (!process.env.MONGO_URI) {
  console.warn('WARNING: MONGO_URI not found in .env. Server will not connect to database.');
} else {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
}

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, default: 'Guest User' },
  email: { type: String, unique: true, sparse: true },
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String },
  credit: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, index: true },
  referralLevel: { type: Number, default: 0 },
  totalJoined: { type: Number, default: 0 },
  subscriptionActive: { type: Boolean, default: false },
  subscriptionPlan: { type: String },
  subscriptionExpiresAt: { type: Date },
  lastResetDate: { type: Date },
  appleOriginalTransactionId: { type: String, index: true, sparse: true },
  createdAt: { type: Date, default: Date.now }
});

const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

const User = mongoose.model('User', userSchema);

// Passive subscription verification & credit reset/expiry helper
async function validateUserSubscription(user) {
  if (!user.subscriptionActive) return;

  const now = new Date();

  // 1. Check expiration
  if (user.subscriptionExpiresAt && now > user.subscriptionExpiresAt) {
    user.subscriptionActive = false;
    user.plan = 'Free';
    user.credit = 0;
    await user.save();
    console.log(`Passive: Subscription for user ${user.id} has expired. Credits reset to 0.`);
    return;
  }

  // 2. Check weekly credit reset (e.g. 7 days since lastResetDate)
  if (user.lastResetDate) {
    const lastReset = new Date(user.lastResetDate);
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;

    if (now.getTime() - lastReset.getTime() >= oneWeekInMs) {
      const maxCredits = user.subscriptionPlan === 'Pro' ? 400 : 200;
      user.credit = maxCredits;
      // Set new reset cycle date to preserve weekly interval
      user.lastResetDate = now;
      await user.save();
      console.log(`Passive: Reset weekly credits for user ${user.id} to ${maxCredits}`);
    }
  }
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });

});

// ----------------------------------------------------
// NEW GUEST CREDIT ROUTE
// ----------------------------------------------------
app.get('/api/guest/:deviceId/credits', async (req, res) => {
  const { deviceId } = req.params;
  try {
    let user = await User.findOne({ id: deviceId });
    if (!user) {
      // Create user if they don't exist in Mongo yet
      user = new User({
        id: deviceId,
        plan: 'Free',
        credit: 0,
        name: 'Guest User',
        referralCode: generateReferralCode()
      });
      await user.save();
    }
    res.json({ success: true, credit: user.credit });
  } catch (error) {
    console.error('Failed to get guest credits:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ----------------------------------------------------
// REFERRAL ENDPOINTS
// ----------------------------------------------------

// Submit a referral code
app.post('/api/guest/:deviceId/referral', async (req, res) => {
  const { deviceId } = req.params;
  const { referralCode } = req.body;

  try {
    if (!referralCode) return res.status(400).json({ error: 'Referral code required' });

    let user = await User.findOne({ id: deviceId });
    if (!user) {
      user = new User({ id: deviceId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }

    if (user.referredBy) {
      return res.status(400).json({ error: 'You have already used a referral code' });
    }

    const codeUpper = referralCode.toUpperCase();
    if (user.referralCode === codeUpper) {
      return res.status(400).json({ error: 'You cannot use your own referral code' });
    }

    const referrer = await User.findOne({ referralCode: codeUpper });
    if (!referrer) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    user.referredBy = codeUpper;
    await user.save();

    // Increment referrer's totalJoined count and save
    referrer.totalJoined = (referrer.totalJoined || 0) + 1;
    await referrer.save();

    res.json({ success: true, message: 'Referral applied successfully' });
  } catch (error) {
    console.error('Referral Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get referral stats
app.get('/api/guest/:deviceId/referral-stats', async (req, res) => {
  const { deviceId } = req.params;

  try {
    let user = await User.findOne({ id: deviceId });
    if (!user) {
      user = new User({ id: deviceId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }

    const totalJoined = await User.countDocuments({ referredBy: user.referralCode });
    if (user.totalJoined !== totalJoined) {
      user.totalJoined = totalJoined;
      await user.save();
    }

    res.json({
      success: true,
      referralCode: user.referralCode,
      totalJoined,
      referralLevel: user.referralLevel || 0,
      referredBy: user.referredBy || null
    });
  } catch (error) {
    console.error('Referral Stats Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Redeem referral rewards
app.post('/api/guest/:deviceId/redeem', async (req, res) => {
  const { deviceId } = req.params;

  try {
    let user = await User.findOne({ id: deviceId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const totalJoined = await User.countDocuments({ referredBy: user.referralCode });
    const currentLevel = user.referralLevel || 0;

    if (currentLevel === 0 && totalJoined >= 3) {
      user.credit += 50;
      user.referralLevel = 1;
      await user.save();
      return res.json({ success: true, message: 'Level 1 reward claimed', credits: user.credit });
    }
    else if (currentLevel === 1 && totalJoined >= 8) { // 3 + 5 = 8
      user.credit += 50;
      user.referralLevel = 2;
      await user.save();
      return res.json({ success: true, message: 'Level 2 reward claimed', credits: user.credit });
    }

    res.status(400).json({ error: 'Not eligible for any rewards yet, or already redeemed.' });
  } catch (error) {
    console.error('Redeem Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- PASSWORD HASHING HELPERS ---
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedPassword) => {
  if (!storedPassword) return false;
  const parts = storedPassword.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
};

// 1. Email Register Route
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = hashPassword(password);
    const userId = 'user_' + crypto.randomBytes(8).toString('hex');

    const user = new User({
      id: userId,
      name,
      email,
      password: hashedPassword,
      plan: 'Free',
      credit: 20, // 20 Welcome credits!
      referralCode: generateReferralCode()
    });

    await user.save();

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Email Login Route
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Google OAuth/Credentials Auth Route
app.post('/api/auth/google', async (req, res) => {
  const { email, name, avatar, googleId } = req.body;
  if (!email || !googleId) {
    return res.status(400).json({ error: 'Email and Google ID are required' });
  }

  try {
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    if (!user) {
      user = new User({
        id: 'google_' + googleId,
        name: name || 'Google User',
        email: email,
        googleId: googleId,
        avatar: avatar || '',
        plan: 'Free',
        credit: 20, // 20 Welcome credits!
        referralCode: generateReferralCode()
      });
      await user.save();
    } else {
      if (!user.googleId) {
        user.googleId = googleId;
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save();
      }
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Update Profile & Password Route
app.post('/api/auth/update', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { name, newPassword } = req.body;

    const user = await User.findOne({ id: decoded.id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) {
      user.name = name;
    }

    if (newPassword) {
      user.password = hashPassword(newPassword);
    }

    await user.save();

    // Create copy without password to return
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// 5. Create Stripe Checkout Session Route
app.post('/api/payment/create-checkout-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const { amount, credits, packageName, successUrl, cancelUrl } = req.body;

  if (!amount || !credits || !packageName) {
    return res.status(400).json({ error: 'Missing package details' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!stripe) {
      // Mock / fallback checkout link pointing to our beautiful local checkout page
      console.log(`STRIPE_SECRET_KEY not set. Redirecting to simulated checkout for user ${decoded.id}`);
      const frontendBase = successUrl ? successUrl.split('#')[0] : 'http://localhost:5173/';
      const mockCheckoutUrl = `${frontendBase}#/checkout?mock=true&amount=${amount}&credits=${credits}&packageName=${encodeURIComponent(packageName)}`;
      return res.json({
        success: true,
        url: mockCheckoutUrl
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: packageName,
              description: `Add ${credits} credits to your ResumeOK account`,
            },
            unit_amount: Math.round(amount * 100), // In cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        userId: decoded.id,
        creditsToAdd: credits,
        newPlan: packageName.split(' ')[0] // e.g. "Basic", "Pro", "Ultimate"
      },
      success_url: successUrl || 'http://localhost:5173/#/profile?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'http://localhost:5173/#/profile?checkout=cancelled',
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Create Checkout Session Error:', error);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

// 6. Confirm Simulated Checkout Payment Route
app.post('/api/payment/confirm-mock-payment', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const { credits, packageName } = req.body;

  if (!credits || !packageName) {
    return res.status(400).json({ error: 'Missing package details' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ id: decoded.id });
    if (user) {
      user.credit += Number(credits);
      user.plan = packageName.split(' ')[0]; // e.g. "Basic", "Pro"
      await user.save();
      console.log(`Simulated Stripe: Credited ${credits} tokens to ${user.id}`);
      res.json({ success: true, user });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Confirm Mock Payment Error:', error);
    res.status(500).json({ error: 'Failed to complete payment simulation' });
  }
});

// ----------------------------------------------------
// DEDUCT ENDPOINT (Kept for backwards compatibility)
// ----------------------------------------------------

// 3. User Info / Secure Session validation Route
app.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token identity
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch the REAL, secure credit balance from database
    const user = await User.findOne({ id: decoded.id });

    if (!user) throw new Error('User not found in DB');

    await validateUserSubscription(user);

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Session expired or invalid' });
  }
});

// 4. Securely Deduct Credits
app.post('/auth/deduct', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ id: decoded.id });

    if (!user) throw new Error('User not found in DB');
    if (user.credit < 2) return res.status(403).json({ error: 'Insufficient credits' });

    user.credit -= 2;
    await user.save();

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid session' });
  }
});

// 4b. Deduct credits for both guest and authenticated users
app.post('/api/credits/deduct', async (req, res) => {
  const { deviceId, amount } = req.body;
  const authHeader = req.headers.authorization;

  let userId = deviceId; // Guest fallback
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      userId = decoded.id;
    } catch (e) {
      return res.status(401).json({ error: 'Invalid Token' });
    }
  }

  if (!userId) return res.status(400).json({ error: 'Missing user identification' });
  const deductAmount = Number(amount) || 0;

  try {
    let user = await User.findOne({ id: userId });
    if (!user) {
      user = new User({ id: userId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    } else {
      await validateUserSubscription(user);
    }

    if (user.credit < deductAmount) {
      return res.status(403).json({ error: 'Insufficient credits' });
    }

    user.credit -= deductAmount;
    await user.save();

    res.json({
      success: true,
      credit: user.credit,
      user
    });
  } catch (error) {
    console.error('Deduct credits error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4c. Refund credits for both guest and authenticated users
app.post('/api/credits/refund', async (req, res) => {
  const { deviceId, amount } = req.body;
  const authHeader = req.headers.authorization;

  let userId = deviceId; // Guest fallback
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      userId = decoded.id;
    } catch (e) {
      return res.status(401).json({ error: 'Invalid Token' });
    }
  }

  if (!userId) return res.status(400).json({ error: 'Missing user identification' });
  const refundAmount = Number(amount) || 0;

  try {
    let user = await User.findOne({ id: userId });
    if (!user) {
      user = new User({ id: userId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }

    user.credit += refundAmount;
    await user.save();

    res.json({
      success: true,
      credit: user.credit,
      user
    });
  } catch (error) {
    console.error('Refund credits error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ----------------------------------------------------
// COMPANY DISCOVERY ENDPOINTS
// ----------------------------------------------------

// --- ADMIN AUTHORIZATION MIDDLEWARE ---
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'resumeok_admin_secret_key_2026';

function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid Admin API Key' });
  }
  next();
}

// Admin route to trigger company discovery seed insertion
app.post('/api/admin/discover', adminAuth, async (req, res) => {
  const { name, domain, companies } = req.body;

  try {
    if (companies && Array.isArray(companies)) {
      console.log(`Starting discovery batch for ${companies.length} companies...`);
      const results = [];
      for (const item of companies) {
        if (item.name && item.domain) {
          try {
            const result = await CompanyDiscoveryService.discoverCompany(item.name, item.domain);
            results.push(result);
          } catch (e) {
            console.error(`Failed discovering seed item: name=${item.name}, domain=${item.domain}`, e);
          }
        }
      }
      return res.json({ success: true, count: results.length, companies: results });
    }

    if (!name || !domain) {
      return res.status(400).json({ error: 'Missing name or domain fields' });
    }

    const result = await CompanyDiscoveryService.discoverCompany(name, domain);
    res.json({ success: true, company: result });
  } catch (error) {
    console.error('Company Discovery Error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete discovery scan' });
  }
});

// ----------------------------------------------------
// PLUGGABLE ATS PROVIDERS ENDPOINTS
// ----------------------------------------------------

// Fetch merged job listings directly from MongoDB Job persistence collection with search features
// --- RATE LIMITER MIDDLEWARE ---
const rateLimitCache = new Map();

function rateLimiter(limit = 100, windowMs = 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    
    let record = rateLimitCache.get(ip);
    if (!record) {
      record = { count: 0, resetTime: now + windowMs };
      rateLimitCache.set(ip, record);
    }
    
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }
    
    record.count++;
    
    if (record.count > limit) {
      return res.status(429).json({ 
        success: false, 
        error: 'Too many requests. Please try again later.' 
      });
    }
    
    next();
  };
}

const searchRateLimiter = rateLimiter(120, 60 * 1000); // 120 per min
const applyRateLimiter = rateLimiter(5, 60 * 1000); // 5 per min

// Fetch merged job listings directly from MongoDB Job persistence collection with search features
app.get('/api/jobs', searchRateLimiter, async (req, res) => {
  const { q, remote, location, company, provider, skills, sortBy, page, limit, lastCreatedAt } = req.query;

  // 1. Check Query Cache
  const cacheKey = JSON.stringify(req.query);
  const cachedData = CacheService.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const query = { isExpired: false };

    // 2. Apply Filters
    if (remote === 'true') {
      query.remote = true;
    }
    if (location) {
      query.location = new RegExp(location.trim(), 'i');
    }
    if (company) {
      query.company = company.toUpperCase().trim();
    }
    if (provider) {
      query.provider = provider.toLowerCase().trim();
    }
    if (skills) {
      const skillsArray = typeof skills === 'string' 
        ? skills.split(',').map(s => s.trim()) 
        : Array.isArray(skills) ? skills : [];
      if (skillsArray.length > 0) {
        query.skills = { $in: skillsArray };
      }
    }

    // 3. Keyset (Cursor-based) Pagination for scalability
    if (lastCreatedAt) {
      query.createdAt = { $lt: new Date(lastCreatedAt) };
    }

    // 4. Full-Text Search and Relevance scoring
    let projection = null;
    let sortOptions = { createdAt: -1 };

    if (q && q.trim() !== '') {
      const queryString = q.trim();
      query.$text = { $search: queryString };
      projection = { score: { $meta: 'textScore' } };
      sortOptions = { score: { $meta: 'textScore' } };
    }

    // 5. Custom Sorting overrides
    if (sortBy === 'date') {
      sortOptions = { postedAt: -1, createdAt: -1 };
    } else if (sortBy === 'company') {
      sortOptions = { company: 1 };
    }

    // 6. Pagination offset limits
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(0, parseInt(limit, 10) || 0); // 0 means return all matching jobs
    const skipNum = lastCreatedAt ? 0 : (pageNum - 1) * limitNum;

    let cursor = DbJob.find(query, projection).sort(sortOptions);
    if (limitNum > 0) {
      cursor = cursor.skip(skipNum).limit(limitNum);
    }

    let jobs = await cursor;

    // 7. Fuzzy/Regex fallback if full-text search yielded 0 results
    if (jobs.length === 0 && q && q.trim() !== '') {
      console.log(`Text search returned 0 results. Running fuzzy regex fallback for: ${q}`);
      const terms = q.trim().split(/\s+/).filter(t => t.length > 1);
      if (terms.length > 0) {
        delete query.$text;
        query.$or = [
          ...terms.map(t => ({ title: { $regex: t, $options: 'i' } })),
          ...terms.map(t => ({ description: { $regex: t, $options: 'i' } })),
          ...terms.map(t => ({ requirements: { $regex: t, $options: 'i' } }))
        ];

        let fallbackCursor = DbJob.find(query).sort({ createdAt: -1 });
        if (limitNum > 0) {
          fallbackCursor = fallbackCursor.skip(skipNum).limit(limitNum);
        }
        jobs = await fallbackCursor;
      }
    }

    // Map database jobs to legacy schema expected by client app
    const legacyJobs = jobs.map(job => {
      const content = job.description + 
        (job.requirements ? "\n\n" + job.requirements : "");
        
      return {
        id: job.jobId,
        title: job.title,
        absolute_url: job.applicationUrl,
        location: { name: job.location },
        departments: [{ id: 0, name: "General" }],
        content: content,
        companyName: job.company,
        boardToken: job.company.toLowerCase(),
        sourceType: job.provider,
        skills: job.skills || [],
        canApplyDirectly: job.canApplyDirectly,
        createdAt: job.createdAt
      };
    });

    const responseData = { 
      success: true, 
      count: legacyJobs.length,
      page: pageNum,
      limit: limitNum,
      jobs: legacyJobs 
    };

    // Cache responses for 60 seconds
    CacheService.set(cacheKey, responseData, 60);

    res.json(responseData);
  } catch (error) {
    console.error('Error in search engine jobs fetch:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve search results' });
  }
});

// Admin route to manually trigger job sync workers
app.post('/api/admin/workers/run', adminAuth, async (req, res) => {
  try {
    await BackgroundWorkers.refreshJobs();
    res.json({ success: true, message: 'Job refresh worker run triggered successfully' });
  } catch (error) {
    console.error('Manual Worker Run Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI-powered resume matching, score compatibility computation, skill breakdown, and cover letter generator
const aiRateLimiter = rateLimiter(10, 60 * 1000); // 10 matches per minute
app.post('/api/jobs/:jobId/match', aiRateLimiter, upload.single('resume'), async (req, res) => {
  const { jobId } = req.params;
  const { resumeText, resumeBase64 } = req.body;
  const resumeFile = req.file;

  try {
    // 1. Find job details in MongoDB
    const job = await DbJob.findOne({ jobId, isExpired: false });
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job posting not found or expired' });
    }

    // 2. Extract base64 resume if uploaded via multipart file
    let base64Data = resumeBase64;
    if (resumeFile) {
      base64Data = resumeFile.buffer.toString('base64');
    }

    if (!resumeText && !base64Data) {
      return res.status(400).json({ success: false, error: 'Missing resume text or uploaded file' });
    }

    // 3. Call AI matching service
    const matchResult = await AiMatchingService.matchResume(
      { title: job.title, description: job.description, requirements: job.requirements },
      resumeText,
      base64Data
    );

    res.json({
      success: true,
      jobId,
      ...matchResult
    });
  } catch (error) {
    console.error('Error in job matching endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to complete AI matching analysis' });
  }
});


// Submit a candidate application with resume upload
app.post('/api/jobs/apply', applyRateLimiter, upload.single('resume'), async (req, res) => {
  const { jobId, companySlug, sourceType, firstName, lastName, email, phone, jobBoardKey } = req.body;
  const resumeFile = req.file;

  if (!jobId || !companySlug || !sourceType || !firstName || !lastName || !email || !resumeFile) {
    return res.status(400).json({ error: 'Missing required application fields or resume file' });
  }

  try {
    const provider = ProviderRegistry.get(sourceType);
    const candidate = { firstName, lastName, email, phone, jobBoardKey };
    
    const result = await provider.apply(jobId, companySlug, candidate, resumeFile);
    res.json(result);
  } catch (error) {
    console.error(`Apply Error for job ${jobId}:`, error);
    res.status(500).json({ error: error.message || 'Failed to submit job application' });
  }
});

// --- Endpoints for Image Generation/Upload (Removed as ResumeOK only uses Gemini) ---

// 7. Direct Apple StoreKit Receipt Verification
app.post('/purchase/verify-apple', async (req, res) => {
  const { receiptData, deviceId } = req.body;
  const authHeader = req.headers.authorization;

  let userId = deviceId; // Fallback to device ID if anonymous

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      userId = decoded.id;
    } catch (e) { }
  }


  if (!userId) return res.status(400).json({ error: 'Missing user identification' });

  try {
    console.log("---------------- APPLE PURCHASE VERIFICATION START ----------------");
    console.log("StoreKit receipt received. Length:", receiptData ? receiptData.length : 0);
    console.log("Receipt Data Preview (First 100 chars):", receiptData ? receiptData.substring(0, 100) : "empty");
    console.log("Receipt Data Preview (Last 100 chars):", receiptData && receiptData.length > 100 ? receiptData.substring(receiptData.length - 100) : "empty");

    const appleSecret = process.env.APPLE_SHARED_SECRET;
    const hasSecret = appleSecret && appleSecret !== 'your_apple_shared_secret_here' && !appleSecret.startsWith('your_apple_shared_secret');

    console.log("Has Apple Shared Secret configured:", hasSecret ? "Yes (Secret omitted for privacy)" : "No");

    // Check if the receiptData is a JWS transaction token (starts with eyJ)
    if (receiptData && receiptData.startsWith('eyJ')) {

      console.log("--> JWSs Token detected (StoreKit 2). Decoding transaction locally...");
      try {
        const parts = receiptData.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          console.log("Decoded JWS Transaction Payload:", payload);

          const productId = payload.productId;
          const transactionId = payload.transactionId;

          if (!productId) {
            console.error("Missing productId in JWS transaction payload:", payload);
            return res.status(400).json({ error: 'Invalid JWS transaction payload: missing productId' });
          }

          let creditsToAdd = 0;
          let newPlan = null;
          if (productId === 'com.resume.starter') { creditsToAdd = 200; newPlan = 'Starter'; }
          else if (productId === 'com.resume.pro') { creditsToAdd = 400; newPlan = 'Pro'; }

          if (creditsToAdd > 0) {
            let user = await User.findOne({ id: userId });
            if (!user) {
              user = new User({ id: userId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
            }
            user.subscriptionActive = true;
            user.subscriptionPlan = newPlan;
            user.appleOriginalTransactionId = payload.originalTransactionId || transactionId;
            user.subscriptionExpiresAt = payload.expiresDate ? new Date(payload.expiresDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            user.lastResetDate = payload.purchaseDate ? new Date(payload.purchaseDate) : new Date();
            user.credit = creditsToAdd;
            user.plan = newPlan;
            await user.save();

            console.log(`Apple StoreKit 2: Granted ${creditsToAdd} credits to ${userId} via JWS decoding`);
            console.log("---------------- APPLE PURCHASE VERIFICATION END ----------------");
            return res.json({ success: true, user });
          } else {
            console.error("Unknown product ID in JWS transaction:", productId);
            return res.status(400).json({ error: 'Unknown product ID in JWS transaction' });
          }
        } else {
          console.error("JWS token does not have 3 parts:", receiptData);
        }
      } catch (err) {
        console.error("Failed to parse JWS Token:", err);
      }
    }

    // Clean receipt data of any whitespace, newlines, or carriage returns
    const cleanedReceipt = receiptData ? receiptData.replace(/\s+/g, '') : '';

    const requestBody = {
      'receipt-data': cleanedReceipt
    };
    if (hasSecret) {
      requestBody.password = appleSecret;
    }

    console.log("Sending verification request to Apple Production server...");
    let appleResponse = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    let appleData = await appleResponse.json();

    console.log("Production response status:", appleData.status);

    // Auto-fallback: If Production returns 21007, it's a Sandbox receipt. Re-verify with Sandbox server.
    if (appleData.status === 21007) {
      console.log("--> FALLBACK: Sandbox receipt detected (status 21007). Retrying with Apple Sandbox server...");
      let sandboxRequestBody = {
        'receipt-data': cleanedReceipt
      };
      if (hasSecret) {
        sandboxRequestBody.password = appleSecret;
      }

      appleResponse = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sandboxRequestBody)
      });
      appleData = await appleResponse.json();
      console.log("Sandbox response status:", appleData.status);
    }

    console.log("Final Apple response properties:", {
      status: appleData.status,
      environment: appleData.environment,
      hasReceipt: !!appleData.receipt,
      receiptType: appleData.receipt ? appleData.receipt.receipt_type : 'N/A'
    });

    if (appleData.status !== 0) {
      console.error("Apple Verification Failed. Status code:", appleData.status);
      console.log("---------------- APPLE PURCHASE VERIFICATION END ----------------");
      return res.status(400).json({
        error: `Invalid Apple Receipt (Status ${appleData.status}). Environment: ${appleData.environment || 'unknown'}`
      });
    }

    const latestReceipts = appleData.latest_receipt_info || (appleData.receipt && appleData.receipt.in_app) || [];
    console.log("Number of transactions in receipt:", latestReceipts.length);

    if (latestReceipts.length === 0) {
      console.error("No purchases found in appleData receipt info.");
      console.log("---------------- APPLE PURCHASE VERIFICATION END ----------------");
      return res.status(400).json({ error: 'No purchase transactions found in this receipt' });
    }

    // Sort transactions by purchase date descending to ensure the first item is the newest
    latestReceipts.sort((a, b) => {
      const timeA = parseInt(a.purchase_date_ms || 0, 10);
      const timeB = parseInt(b.purchase_date_ms || 0, 10);
      return timeB - timeA;
    });

    const purchasedItem = latestReceipts[0];
    console.log("Latest transaction item:", {
      product_id: purchasedItem.product_id,
      transaction_id: purchasedItem.transaction_id,
      purchase_date: purchasedItem.purchase_date,
      original_purchase_date: purchasedItem.original_purchase_date
    });
    const productId = purchasedItem.product_id;

    let creditsToAdd = 0;
    let newPlan = null;

    if (productId === 'com.resume.starter') { creditsToAdd = 200; newPlan = 'Starter'; }
    else if (productId === 'com.resume.pro') { creditsToAdd = 400; newPlan = 'Pro'; }

    if (creditsToAdd > 0) {
      let user = await User.findOne({ id: userId });
      if (!user) {
        user = new User({ id: userId, plan: 'Free', credit: 0, name: 'Guest User', referralCode: generateReferralCode() });
      }

      const transactionId = purchasedItem.transaction_id;
      const originalTransactionId = purchasedItem.original_transaction_id || transactionId;
      const expiresDate = purchasedItem.expires_date_ms ? new Date(Number(purchasedItem.expires_date_ms)) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const purchaseDate = purchasedItem.purchase_date_ms ? new Date(Number(purchasedItem.purchase_date_ms)) : new Date();

      user.subscriptionActive = true;
      user.subscriptionPlan = newPlan;
      user.appleOriginalTransactionId = originalTransactionId;
      user.subscriptionExpiresAt = expiresDate;
      user.lastResetDate = purchaseDate;
      user.credit = creditsToAdd;
      user.plan = newPlan;

      await user.save();
      console.log(`Apple StoreKit: Granted ${creditsToAdd} credits to ${userId}`);
      res.json({ success: true, user });
    } else {
      res.status(400).json({ error: 'Unknown product ID' });
    }
  } catch (error) {
    console.error('Apple verification failed:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});


// --- Endpoints for Image Generation/Upload (Removed as ResumeOK only uses Gemini) ---

// 8. Degrade User to Free (Client-side StoreKit Sync)
app.post('/purchase/degrade-to-free', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ id: decoded.id });
    if (user) {
      if (user.subscriptionActive) {
        user.subscriptionActive = false;
        user.plan = 'Free';
        user.credit = 0;
        await user.save();
        console.log(`StoreKit sync: Set user ${user.id} to Free (no active subscription found in StoreKit).`);
      }
      res.json({ success: true, user });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Degrade To Free Error:', error);
    res.status(500).json({ error: 'Failed to update subscription status' });
  }
});

// App configuration & update checker endpoint
app.get('/api/app-config', (req, res) => {
  res.json({
    latestVersion: '2.0.3',
    minVersion: '2.0.1',
    trackViewUrl: 'https://apps.apple.com/app/resumeok-ai-resume-builder/id6783382482'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Production Backend Server running on port ${PORT}`);
  // Start scheduled background workers
  BackgroundWorkers.start();
});
