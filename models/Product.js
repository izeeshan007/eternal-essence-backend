import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },

  category: {
    type: String,
    enum: ['Perfume', 'Attar', 'Solid Perfume', 'Combo'],
    required: true
  },

  gender: {
    type: String,
    enum: ['Male', 'Female', 'Unisex'],
    default: 'Unisex'
  },

  inspiredBy: String,

  family: String,

  season: String, // ✅ ADD THIS

  time: {           // ✅ ADD THIS
    type: String,
    enum: ['Day', 'Night', 'Day/Night']
  },

  accords: [String],

  notes: {
    top: String,
    mid: String,
    base: String
  },

  price: { type: Number, required: true },

sizes: [
  {
    value: Number,
    unit: { type: String, enum: ['ml', 'gm'] },
    priceMultiplier: Number
  }
],


  images: [String],

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Product', productSchema);
