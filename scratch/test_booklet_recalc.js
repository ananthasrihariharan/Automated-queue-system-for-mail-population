function fitCount(printable, job, gap) {
  if (job <= 0 || printable <= 0) return 0;
  return Math.floor((printable + gap) / (job + gap));
}

function layoutFor(printableWidth, printableHeight, jobWidth, jobHeight, gap) {
  const jobsAcross = fitCount(printableWidth, jobWidth, gap);
  const rows = fitCount(printableHeight, jobHeight, gap);
  const ups = jobsAcross * rows;
  return { jobsAcross, rows, ups };
}

function calculateUps(input) {
  const sheetWidth = Number(input.sheetWidth);
  const sheetHeight = Number(input.sheetHeight);
  const jobWidth = Number(input.jobWidth);
  const jobHeight = Number(input.jobHeight);
  const margin = Number(input.printableMargin) || 0;
  const gap = input.cutType === 'none' ? 0 : (Number(input.cutGap) || 0);

  const printableWidth = Math.max(0, sheetWidth - 2 * margin);
  const printableHeight = Math.max(0, sheetHeight - 2 * margin);

  const original = layoutFor(printableWidth, printableHeight, jobWidth, jobHeight, gap);
  const rotated = layoutFor(printableWidth, printableHeight, jobHeight, jobWidth, gap);

  let originalValid = original.ups > 0;
  let rotatedValid = rotated.ups > 0;

  if (input.bookletSide) {
    const side = input.bookletSide.toLowerCase().trim();
    if (side === 'left' || side === 'right') {
      originalValid = original.jobsAcross > 0 && original.jobsAcross % 2 === 0;
      rotatedValid = rotated.rows > 0 && rotated.rows % 2 === 0;
    } else if (side === 'top' || side === 'bottom') {
      originalValid = original.rows > 0 && original.rows % 2 === 0;
      rotatedValid = rotated.jobsAcross > 0 && rotated.jobsAcross % 2 === 0;
    }
  }

  let useRotated = false;
  let best = original;

  if (originalValid && rotatedValid) {
    useRotated = rotated.ups > original.ups;
    best = useRotated ? rotated : original;
  } else if (rotatedValid) {
    useRotated = true;
    best = rotated;
  } else if (originalValid) {
    useRotated = false;
    best = original;
  } else {
    best = { jobsAcross: 0, rows: 0, ups: 0 };
  }

  return {
    orientation: useRotated ? 'rotated' : 'original',
    jobsAcross: best.jobsAcross,
    rows: best.rows,
    ups: best.ups,
  };
}

function validate(sheet, job, request) {
  let jobW = job.width;
  let jobH = job.height;
  const side = (request.bindingSide || '').toLowerCase().trim();
  const margin = request.bindingMargin || 0;
  if (side === 'left' || side === 'right') {
    jobW = job.width + margin;
  } else if (side === 'top' || side === 'bottom') {
    jobH = job.height + margin;
  }

  return calculateUps({
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
    jobWidth: jobW,
    jobHeight: jobH,
    cutType: job.cutType,
    cutGap: job.cutGap,
    printableMargin: job.printableMargin,
    bookletSide: request.bindingSide,
  });
}

const sheet = { name: '315*453', width: 315, height: 453 };
const sheetLarger = { name: '330*635', width: 330, height: 635 };

const jobL = { width: 291, height: 210, qty: 1000, cutType: 'none', cutGap: 0, printableMargin: 5 };
const requestL = { templateType: 'booklet', openingDirection: 'landscape', bindingSide: 'left', bindingMargin: 10 };

const jobP = { width: 210, height: 291, qty: 1000, cutType: 'none', cutGap: 0, printableMargin: 5 };
const requestP = { templateType: 'booklet', openingDirection: 'portrait', bindingSide: 'left', bindingMargin: 10 };

console.log('--- Test on 315*453 sheet ---');
console.log('Landscape Booklet UPS:', validate(sheet, jobL, requestL));
console.log('Portrait Booklet UPS:', validate(sheet, jobP, requestP));

console.log('--- Test on 330*635 sheet ---');
console.log('Landscape Booklet UPS:', validate(sheetLarger, jobL, requestL));
console.log('Portrait Booklet UPS:', validate(sheetLarger, jobP, requestP));
