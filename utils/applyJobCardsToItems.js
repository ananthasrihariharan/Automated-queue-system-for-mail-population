const { jobCardRepo } = require('../repositories')
const { mergeJobCardIntoItem, jobCardLookupIds } = require('./jobCardToPostPress')

async function findJobCardForItem(jobId, itemIndex) {
  const ids = jobCardLookupIds(jobId, itemIndex)
  for (const id of ids) {
    const card = await jobCardRepo.findOne({ jobId: id })
    if (card) return card
  }
  return null
}

async function applyJobCardsToItems(jobId, items) {
  const ids = items.flatMap((_, i) => jobCardLookupIds(jobId, i))
  const query = jobCardRepo.find({ jobId: { $in: ids } })
  const cards = typeof query.lean === 'function' ? await query.lean() : await query
  const cardMap = new Map(cards.map(c => [c.jobId, c]))
  return items.map((item, i) => {
    const id = jobCardLookupIds(jobId, i).find(id => cardMap.has(id))
    return id ? mergeJobCardIntoItem(item, cardMap.get(id)) : item
  })
}

module.exports = {
  findJobCardForItem,
  applyJobCardsToItems
}

