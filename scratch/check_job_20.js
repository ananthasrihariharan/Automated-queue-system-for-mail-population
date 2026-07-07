require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../lib/prisma');
const { JobRepository } = require('../repositories');

const BINDING_DISPLAY_NAMES = {
  'SADDLE_STITCH': 'Center Pin',
  'CENTER_PIN':    'Center Pin',
  'CREASE':        'Creasing',
  'CREASE_PERF':   'Creasing / Perf',
  'PERFORATION':   'Perforation',
  'WHEEL_PERF':    'Wheel Perforation',
};

const STAGE_ALIASES = {
  'SPIRAL_BIND': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'WIRO_BINDING': ['Wiro', 'Wiro Binding', 'Spiral', 'Spiral Bind'],
  'PERFECT_BIND': ['Perfect', 'Perfect Binding'],
  'PERFECT': ['Perfect', 'Perfect Binding'],
  'CENTER_PIN': ['Center Pin'],
  'CENTRE_PIN': ['Center Pin'],
  'POUCH_LAMINATION': ['Pouch', 'Pouch Lamination'],
  'SADDLE_STITCH': ['Center Pin']
};

function getStageCandidates(stage, val, item) {
  if (!val || val === 'NONE') {
    if (stage === 'binding' && item.pouchLamination === true) {
      return ['Pouch', 'Pouch Lamination', 'POUCH_LAMINATION'];
    }
    return [];
  }

  const candidates = [];

  if (typeof val === 'boolean') {
    if (val === true) {
      candidates.push(stage);
      const friendlyStage = stage.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      candidates.push(friendlyStage);
    }
  } else if (typeof val === 'string') {
    candidates.push(val);
    const cleanVal = val.includes('(') ? val.substring(0, val.indexOf('(')).trim() : val;
    candidates.push(cleanVal);
    
    const words = cleanVal.replace(/_/g, ' ').toLowerCase().split(' ');
    const friendlyVal = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    candidates.push(friendlyVal);

    const friendlyStage = stage.replace(/([A-Z])/g, ' $1').trim();
    const capitalizedStage = friendlyStage.charAt(0).toUpperCase() + friendlyStage.slice(1);
    candidates.push(stage, friendlyStage, capitalizedStage, `${capitalizedStage} Flow`);
    if (stage === 'lamination') {
      candidates.push('Laminated');
    }

    const aliases = STAGE_ALIASES[val];
    if (aliases) {
      candidates.push(...aliases);
    }
  }

  return [...new Set(candidates)];
}

const resolveFlowVariant = (item, productFlows) => {
  if (!productFlows || typeof productFlows !== 'object') return 'Default';

  const fields = [
    'binding',
    'lamination',
    'creasing',
    'dieCutting',
    'cornerCutting',
    'foil',
    'fusing',
    'holes',
    'cutting',
    'cutting2'
  ];

  const keys = Object.keys(productFlows);
  for (const field of fields) {
    const val = item[field];
    const candidates = getStageCandidates(field, val, item);
    if (candidates.length > 0) {
      for (const candidate of candidates) {
        const matchedKey = keys.find(k => k.toLowerCase() === candidate.toLowerCase());
        if (matchedKey) return matchedKey;
      }
    }
  }

  return 'Default';
};

const workflowRows = (item, productSequences) => {
  const isPouchLam = item.pouchLamination === true;
  const isIdCard = item.idCard === true;
  const hasBinding = item.binding && item.binding !== 'NONE';
  const hasCornerCut = item.cornerCutting && item.cornerCutting !== 'NONE';
  const isBindingFlow = hasBinding && !isPouchLam && !hasCornerCut && !isIdCard;

  const pressStatus = item.printConfirmed ? 'COMPLETED' : 'PENDING';
  const pressRow = { key: 'press', name: 'Press', type: 'Print', status: pressStatus };

  const all = [
    { key: 'cutting',       name: 'Cutting',        type: item.cutting,        status: item.cuttingStatus },
    { key: 'fusing',        name: 'Fusing',          type: item.fusing,         status: item.fusingStatus },
    { key: 'cutting2',      name: 'Cutting 2',       type: item.cutting2,       status: item.cutting2Status },
    { key: 'cornerCutting', name: 'Corner Cutting',  type: item.cornerCutting,  status: item.cornerCuttingStatus },
    { key: 'holes',         name: 'Holes',           type: item.holes,          status: item.holesStatus },
    { key: 'lamination',    name: 'Lamination',      type: item.lamination,     status: item.laminationStatus },
    { key: 'foil',          name: 'Foil',            type: item.foil,           status: item.foilStatus },
    { key: 'binding',       name: 'Binding / Fold',  type: item.binding,        status: item.bindingStatus },
    { key: 'creasing',      name: 'Creasing',        type: item.creasing,       status: item.creasingStatus },
    { key: 'dieCutting',    name: 'Die Cutting',     type: item.dieCutting,     status: item.dieCuttingStatus },
  ];

  let order = [];

  const productFlows = productSequences && productSequences[item.type];
  if (productFlows && typeof productFlows === 'object') {
    const activeFlowName = resolveFlowVariant(item, productFlows);
    const sequence = productFlows[activeFlowName] || productFlows['Default'];
    if (Array.isArray(sequence) && sequence.length > 0) {
      order = sequence;
    }
  }

  if (order.length === 0) {
    if (isIdCard) {
      order = ['cutting', 'fusing', 'cutting2', 'cornerCutting', 'holes'];
    } else if (item.foil && item.foil !== 'NONE' && hasBinding && !isPouchLam) {
      order = ['lamination', 'foil', 'binding', 'cutting', 'dieCutting', 'cornerCutting'];
    } else if (item.foil && item.foil !== 'NONE') {
      order = ['lamination', 'foil', 'cutting', 'dieCutting', 'cornerCutting'];
    } else if (isBindingFlow) {
      order = ['lamination', 'creasing', 'binding', 'cutting', 'dieCutting', 'cornerCutting'];
    } else if (isPouchLam) {
      order = ['cutting', 'binding', 'cornerCutting'];
    } else {
      order = ['lamination', 'cutting', 'binding', 'cornerCutting', 'creasing', 'dieCutting'];
    }
  }

  const postPressRows = order
    .map(k => {
      const found = all.find(r => r.key === k);
      if (found) return found;
      const displayName = k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      const stepStatus = item.workflowSteps?.find((s) => s.stepName === k)?.status || 'NONE';
      return { key: k, name: displayName, type: 'Custom Process', status: stepStatus };
    })
    .filter(r => r && ((r.type && r.type !== 'NONE') || r.status !== 'NONE'));

  const dispatched = item._jobStatus === 'DISPATCHED';
  const dispatchRow = {
    key: 'dispatch',
    name: 'Dispatch',
    type: dispatched ? 'Dispatched' : 'Ready to ship',
    status: dispatched ? 'COMPLETED' : 'PENDING'
  };
  return [pressRow, ...postPressRows, dispatchRow];
};

async function main() {
  const rawJobs = await prisma.job.findMany({
    where: { jobId: { in: ['10-020726', '20-020726'] } },
    include: {
      jobItems: {
        include: {
          laminationSpec: true,
          creasingSpec: true,
          bindingSpec: true,
          cuttingSpec: true,
          dieCuttingSpec: true,
          cornerCuttingSpec: true,
          foilSpec: true,
          idCardSpec: true
        }
      },
      taskLogs: true
    }
  });
  
  if (rawJobs.length === 0) {
    console.log('No jobs found.');
    return;
  }
  
  const { adaptJobToLegacyShape } = require('../lib/responseAdapters');
  const jobs = rawJobs.map(j => adaptJobToLegacyShape(j));
  
  const processRegistry = require('../services/processRegistry');
  await processRegistry.refresh();
  const productSequences = processRegistry.getMergedRegistry()?.productSequences || null;

  for (const job of jobs) {
    console.log(`\n======================================================`);
    console.log(`Job: ${job.jobId}, Status: ${job.jobStatus}`);
    
    job.items.forEach((item, index) => {
      const activeFlowName = resolveFlowVariant(item, productSequences[item.type]);
      console.log(`\nItem ${index} type "${item.type}":`);
      console.log("Determined activeFlowName:", activeFlowName);
      
      const rows = workflowRows({ ...item, _jobStatus: job.jobStatus }, productSequences);
      console.log("  Workflow Rows:");
      rows.forEach(r => {
        console.log(`    - key: ${r.key}, name: ${r.name}, type: ${r.type}, status: ${r.status}`);
      });
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
