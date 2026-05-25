const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  credit: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await User.updateMany({ id: 'guest_device' }, { credit: 100 });
  console.log('Guest credits reset to 100!');
  process.exit(0);
});
