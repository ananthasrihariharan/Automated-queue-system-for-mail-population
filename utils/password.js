const bcrypt = require('bcryptjs')

exports.generateInitialPassword = (name, phone) => {
  const firstName = name.split(' ')[0]
  const last5 = phone.slice(-5)
  return `${firstName}@${last5}`
}

exports.hashPassword = async (plain) => {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(plain, salt)
}