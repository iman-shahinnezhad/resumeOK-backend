const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
  email: { type: String },
  avatar: { type: String },
  credit: { type: Number, default: 2 },
  plan: { type: String, default: 'Free' },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, index: true },
  referralLevel: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

const User = mongoose.model('User', userSchema);

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
        credit: 2,
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
      user = new User({ id: deviceId, plan: 'Free', credit: 2, name: 'Guest User', referralCode: generateReferralCode() });
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
      user = new User({ id: deviceId, plan: 'Free', credit: 2, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }

    const totalJoined = await User.countDocuments({ referredBy: user.referralCode });

    res.json({
      success: true,
      referralCode: user.referralCode,
      totalJoined,
      referralLevel: user.referralLevel || 0
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the REAL, secure credit balance from database
    const user = await User.findOne({ id: decoded.id });

    if (!user) throw new Error('User not found in DB');

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// 5. Secure Upload Route (Segmind Proxy - Upload Only)
app.post('/api/upload', async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Image base64 is required' });
  }

  try {
    const SEGMIND_API_KEY = process.env.SEGMIND_API_KEY;
    if (!SEGMIND_API_KEY) return res.status(500).json({ error: 'Segmind key missing' });

    const uploadRes = await fetch('https://workflows-api.segmind.com/upload-asset', {
      method: 'POST',
      headers: {
        'x-api-key': SEGMIND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data_urls: [`data:image/jpeg;base64,${imageBase64}`] }),
    });

    if (!uploadRes.ok) throw new Error('Failed to upload image to AI server');
    const uploadData = await uploadRes.json();

    let uploadUrl = '';
    if (Array.isArray(uploadData) && uploadData.length > 0) uploadUrl = uploadData[0];
    else if (uploadData.file_urls && uploadData.file_urls.length > 0) uploadUrl = uploadData.file_urls[0];

    if (!uploadUrl) throw new Error('No upload URL returned');

    res.json({ success: true, uploadUrl });
  } catch (error) {
    console.error('Upload Error:', error.message);
    res.status(500).json({ error: error.message || 'Server Error' });
  }
});

// 6. Secure AI Generation Route (Segmind Proxy - Generate Only)
app.post('/api/generate', async (req, res) => {
  const { deviceId, uploadUrl, eraPrompt, cost, quality, ratio } = req.body;
  const authHeader = req.headers.authorization;

  let userId = deviceId; // Guest fallback
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (e) {
      return res.status(401).json({ error: 'Invalid Token' });
    }
  }

  if (!userId) return res.status(400).json({ error: 'Missing user identification' });
  if (!eraPrompt) return res.status(400).json({ error: 'eraPrompt is required' });

  try {
    let user = await User.findOne({ id: userId });



    if (!user) {
      user = new User({ id: userId, plan: 'Free', credit: 2, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }

    const deductAmount = typeof cost === 'number' ? cost : 2;

    if (user.credit < deductAmount && deductAmount > 0) {
      return res.status(403).json({ error: 'Insufficient credits. Please upgrade.' });
    }

    const SEGMIND_API_KEY = process.env.SEGMIND_API_KEY;
    if (!SEGMIND_API_KEY) return res.status(500).json({ error: 'Segmind key missing' });

    // 2. Generate Image
    const generateRes = await fetch('https://api.segmind.com/v1/nano-banana-2', {
      method: 'POST',
      headers: {
        'x-api-key': SEGMIND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        seed: Math.floor(Math.random() * 1000000),
        prompt: eraPrompt,
        ...(uploadUrl ? { image_urls: [uploadUrl] } : {}),
        web_search: false,
        aspect_ratio: ratio || "1:1",
        output_format: "jpg",
        thinking_level: "minimal",
        safety_tolerance: 4,
        output_resolution: quality || "1K",
        response_modalities: "IMAGE",
        base64: true
      }),
    });

    if (!generateRes.ok) throw new Error('AI Generation failed');

    let resultBase64 = '';
    let genData = null;
    let textResponse = '';
    const contentType = generateRes.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      genData = await generateRes.json();
      if (Array.isArray(genData) && genData.length > 0) resultBase64 = genData[0].base64 || genData[0];
      else if (genData && typeof genData === 'object') resultBase64 = genData.base64 || genData.image;
    } else if (contentType.includes('image')) {
      const arrayBuffer = await generateRes.arrayBuffer();
      resultBase64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      textResponse = await generateRes.text();
    }

    if (!resultBase64) throw new Error('Invalid response: ' + (genData ? JSON.stringify(genData) : textResponse));

    // ONLY DEDUCT CREDIT IF GENERATION WAS SUCCESSFUL
    user.credit -= deductAmount;
    await user.save();

    res.json({
      success: true,
      image: resultBase64.startsWith('http') ? resultBase64 : `data:image/jpeg;base64,${resultBase64}`,
      remainingCredits: user.credit
    });

  } catch (error) {
    console.error('Generation Error:', error.message);
    res.status(500).json({ error: error.message || 'Server Error' });
  }
});

// 7. Direct Apple StoreKit Receipt Verification
app.post('/purchase/verify-apple', async (req, res) => {
  const { receiptData, deviceId } = req.body;
  const authHeader = req.headers.authorization;

  let userId = deviceId; // Fallback to device ID if anonymous

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (e) { }
  }

  if (!userId) return res.status(400).json({ error: 'Missing user identification' });

  try {
    const appleUrl = process.env.NODE_ENV === 'production'
      ? 'https://buy.itunes.apple.com/verifyReceipt'
      : 'https://sandbox.itunes.apple.com/verifyReceipt';

    const appleResponse = await fetch(appleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': process.env.APPLE_SHARED_SECRET
      })
    });
    const appleData = await appleResponse.json();

    if (appleData.status !== 0) {
      console.error("Apple Verification Failed:", appleData.status);
      return res.status(400).json({ error: 'Invalid Apple Receipt' });
    }

    const latestReceipts = appleData.latest_receipt_info || appleData.receipt.in_app || [];
    if (latestReceipts.length === 0) return res.status(400).json({ error: 'No purchases found' });

    const purchasedItem = latestReceipts[latestReceipts.length - 1];
    const productId = purchasedItem.product_id;

    let creditsToAdd = 0;
    let newPlan = null;

    if (productId === 'com.relook.pro') { creditsToAdd = 50; newPlan = 'Pro'; }
    else if (productId === 'com.relook.max') { creditsToAdd = 100; newPlan = 'Max'; }

    if (creditsToAdd > 0) {
      let user = await User.findOne({ id: userId });
      if (!user) {
        user = new User({ id: userId, plan: 'Free', credit: 2, name: 'Guest User', referralCode: generateReferralCode() });
      }

      user.credit += creditsToAdd;
      if (newPlan) user.plan = newPlan;

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


// 7. Secure AI Image Route (Img2Img)
app.post('/api/generate-image', async (req, res) => {
  const { deviceId, uploadUrl, eraPrompt, cost, quality, ratio } = req.body;
  const authHeader = req.headers.authorization;
  if (!eraPrompt) return res.status(400).json({ error: 'eraPrompt is required' });
  if (!uploadUrl) return res.status(400).json({ error: 'uploadUrl is required' });

  try {
    let userId = deviceId;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (e) { }
    }

    let user = await User.findOne({ id: userId });
    if (!user) {
      user = new User({ id: userId, plan: 'Free', credit: 2, name: 'Guest User', referralCode: generateReferralCode() });
      await user.save();
    }
    if (user.credit < (cost || 2)) return res.status(403).json({ error: 'Insufficient credits' });

    const SEGMIND_API_KEY = process.env.SEGMIND_API_KEY;

    // Fetch the image from uploadUrl to get base64
    const imgRes = await fetch(uploadUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64');

    const generateRes = await fetch('https://api.segmind.com/v1/sdxl-img2img', {
      method: 'POST',
      headers: { 'x-api-key': SEGMIND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: eraPrompt,
        image: imageBase64,
        strength: 0.8,
        samples: 1,
        scheduler: "dpmpp_2m",
        num_inference_steps: 25,
        guidance_scale: 7.5,
        base64: true
      }),
    });

    if (!generateRes.ok) {
      const errText = await generateRes.text();
      throw new Error('API Error: ' + errText);
    }

    const genData = await generateRes.json();
    let resultBase64 = '';
    if (genData.image) resultBase64 = genData.image;

    if (!resultBase64) throw new Error('Invalid response: ' + JSON.stringify(genData));

    user.credit -= (cost || 2);
    await user.save();

    res.json({
      success: true,
      image: `data:image/jpeg;base64,${resultBase64}`,
      remainingCredits: user.credit
    });
  } catch (error) {
    console.error('Generate Image Error:', error);
    res.status(500).json({ error: error.message || 'Server Error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Production Backend Server running on port ${PORT}`);
});
