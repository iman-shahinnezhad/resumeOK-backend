const mongoose = require('mongoose');
require('dotenv').config({ path: '../server/.env' });

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, default: 'Guest User' },
  credit: { type: Number, default: 0 },
  referralCode: { type: String },
  totalJoined: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find({});
  console.log('Users in DB:');
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
