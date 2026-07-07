require('dotenv').config()
const { laminationProductRepo } = require('../repositories')

async function run() {
  try {
    console.log('Running test query on laminationProductRepo.find...')
    const result = await laminationProductRepo.find({ deleted: false })
    console.log('Result:', result)
  } catch (err) {
    console.error('Error during find:', err)
  }
}

run()
