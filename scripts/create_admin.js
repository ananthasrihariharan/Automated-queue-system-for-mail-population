require('dotenv').config()
const { hashPassword } = require('../utils/password')
const prisma = require('../lib/prisma')

async function main() {
  const name = 'Test Admin'
  const phone = '9999999999'
  const email = 'admin@test.com'
  const plainPassword = 'adminpassword123'

  console.log('Hashing password...')
  const hashedPassword = await hashPassword(plainPassword)

  // Ensure ADMIN role exists in Role table
  const adminRole = await prisma.role.upsert({
    where: { roleName: 'ADMIN' },
    create: { roleName: 'ADMIN' },
    update: {}
  })

  console.log('Checking if user already exists...')
  let user = await prisma.user.findUnique({
    where: { phone }
  })

  if (!user) {
    console.log('Creating admin user in Postgres...')
    user = await prisma.user.create({
      data: {
        legacyMongoId: `legacy_${Date.now()}_admin`,
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'ADMIN',
        rawRoles: ['ADMIN'],
        isActive: true
      }
    })
    console.log('User created:', user.id)
  } else {
    console.log('User already exists. Ensuring rawRoles contains ADMIN...')
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'ADMIN',
        rawRoles: ['ADMIN']
      }
    })
  }

  // Create UserRole link
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id
      }
    },
    create: {
      userId: user.id,
      roleId: adminRole.id
    },
    update: {}
  })

  console.log('Test Admin created successfully!')
  console.log('---------------------------------')
  console.log(`Phone: ${phone}`)
  console.log(`Password: ${plainPassword}`)
  console.log('---------------------------------')

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Error creating admin:', err)
  process.exit(1)
})
