const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('./models/User')

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/Despatch_System')

    const users = [
        {
            name: 'System Admin',
            phone: '9443748173',
            roles: ['ADMIN'],
            plain: 'System@48173'
        },
        {
            name: 'Prepress Staff',
            phone: '9000000001',
            roles: ['PREPRESS'],
            plain: 'Prepress@00001'
        },
        {
            name: 'Cashier',
            phone: '9000000002',
            roles: ['CASHIER'],
            plain: 'Cashier@00002'
        },
        {
            name: 'Dispatch Staff',
            phone: '9000000003',
            roles: ['DISPATCH'],
            plain: 'Dispatch@00003'
        },
        {
            name: 'Multi Role',
            phone: '9888812345',
            roles: ['CASHIER', 'DISPATCH'],
            plain: 'Multi@12345'
        }
    ]

    await User.deleteMany({})

    for (const u of users) {
        await User.create({
            name: u.name,
            phone: u.phone,
            roles: u.roles,
            password: u.plain,
            isActive: true
        })

        console.log(`Created ${u.name} → ${u.plain}`)
    }

    console.log('All users created')
    process.exit()
}

run()
