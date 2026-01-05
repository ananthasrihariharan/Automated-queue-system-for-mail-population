const fs = require('fs')

const users = [
    { phone: '9443748173', password: 'System@48173', name: 'System Admin' },
    { phone: '9000000001', password: 'Prepress@00001', name: 'Prepress Staff' },
    { phone: '9000000002', password: 'Cashier@00002', name: 'Cashier' },
    { phone: '9000000003', password: 'Dispatch@00003', name: 'Dispatch Staff' },
    { phone: '9888812345', password: 'Multi@12345', name: 'Multi Role' }
]

async function testLogins() {
    let log = ''
    for (const u of users) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        try {
            const res = await fetch('http://localhost:5000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: u.phone,
                    password: u.password
                }),
                signal: controller.signal
            })
            clearTimeout(timeoutId)
            const data = await res.json()
            if (res.ok) {
                log += `✅ Login successful for ${u.name} (${u.phone})\n`
            } else {
                log += `❌ Login failed for ${u.name} (${u.phone}): ${data.message}\n`
            }
        } catch (err) {
            log += `❌ Request failed for ${u.name} (${u.phone}): ${err.message}\n`
        }
    }
    fs.writeFileSync('login_results.txt', log)
    console.log('Results written to login_results.txt')
}

testLogins()
