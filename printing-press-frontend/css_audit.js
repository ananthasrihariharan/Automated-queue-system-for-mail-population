const fs = require('fs')
const path = require('path')

function extractClassesFromTSX(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const classMatches = content.match(/className=["']([^"']+)["']/g) || []
  const classMatchesDynamic = content.match(/className=\{`([^`]+)`\}/g) || []
  
  const classSet = new Set()
  
  classMatches.forEach(m => {
    const classes = m.replace(/className=["']|["']/g, '').split(' ')
    classes.forEach(c => c && classSet.add(c.trim()))
  })

  classMatchesDynamic.forEach(m => {
    // Basic extraction of dynamic strings like className={`status-badge ${status}`}
    // We only take the static parts
    const staticParts = m.replace(/className=\{`|`\}/g, '').replace(/\$\{[^}]+\}/g, '').split(' ')
    staticParts.forEach(c => c && classSet.add(c.trim()))
  })
  
  return Array.from(classSet)
}

function extractClassesFromCSS(filePath) {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  // Match .classname { or .classname:hover
  const classMatches = content.match(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g) || []
  
  const classSet = new Set()
  classMatches.forEach(m => {
    classSet.add(m.replace('.', ''))
  })
  return Array.from(classSet)
}

function audit(tsxFile, cssFile) {
  const tsxClasses = extractClassesFromTSX(tsxFile)
  const cssClasses = extractClassesFromCSS(cssFile)
  
  // also check index.css or App.css because some might be global
  const globalCssClasses = extractClassesFromCSS(path.join(__dirname, 'src/index.css'))
  const appCssClasses = extractClassesFromCSS(path.join(__dirname, 'src/App.css'))
  
  const allValidClasses = new Set([...cssClasses, ...globalCssClasses, ...appCssClasses])
  
  console.log(`\n--- Audit for ${path.basename(tsxFile)} ---`)
  let missing = []
  tsxClasses.forEach(c => {
    if (!allValidClasses.has(c)) {
       missing.push(c)
    }
  })
  
  if (missing.length === 0) {
    console.log('✅ ALL Classes are defined in CSS!')
  } else {
    console.log('❌ MISSING CLASSES (used in TSX but not found in CSS):')
    missing.forEach(c => console.log('  - ' + c))
  }
}

const dir = path.join(__dirname, 'src/modules')
audit(path.join(dir, 'admin/AdminQueuePanel.tsx'), path.join(dir, 'admin/AdminQueuePanel.css'))
audit(path.join(dir, 'prepress/QueueDashboard.tsx'), path.join(dir, 'prepress/QueueDashboard.css'))
