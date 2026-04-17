const mongoose = require('mongoose')

const CustomerPreferenceSchema = new mongoose.Schema(
  {
    customerEmail: {
      type: String,
      required: true,
      index: true
    },

    customerName: { type: String, default: '' },

    preferredStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    confirmedCount: { type: Number, default: 1 }
  },
  { timestamps: true }
)

// One preference per customer-email + staff combination
CustomerPreferenceSchema.index({ customerEmail: 1, preferredStaff: 1 }, { unique: true })

module.exports = mongoose.model('CustomerPreference', CustomerPreferenceSchema)
