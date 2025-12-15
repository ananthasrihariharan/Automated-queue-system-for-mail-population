const REQUIRED_FILES = 3
let selectedFiles = []

const dropZone = document.getElementById('dropZone')
const fileInput = document.getElementById('fileInput')
const uploadBtn = document.getElementById('uploadBtn')
const fileCountText = document.getElementById('fileCountText')

// Click to select
dropZone.onclick = () => fileInput.click()

// Handle file selection
fileInput.onchange = (e) => handleFiles(e.target.files)

// Drag & Drop
dropZone.ondragover = (e) => e.preventDefault()
dropZone.ondrop = (e) => {
  e.preventDefault()
  handleFiles(e.dataTransfer.files)
}

function handleFiles(files) {
  selectedFiles = Array.from(files)

  fileCountText.innerText = `${selectedFiles.length} / ${REQUIRED_FILES} files selected`

  uploadBtn.disabled = selectedFiles.length !== REQUIRED_FILES
}
