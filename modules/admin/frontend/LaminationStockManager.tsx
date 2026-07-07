import { useState, useEffect } from 'react'
import {
  fetchLaminationProducts,
  createLaminationProduct,
  toggleLaminationProductAvailability,
  deleteLaminationProduct,
  fetchLaminationRollUsageReport
} from '@core/services/api'
import ProductManager from './ProductManager'
import WorkflowStepManager from './WorkflowStepManager'
import ProductWorkflowManager from './ProductWorkflowManager'
import BoardManager from './BoardManager'
import MachineManager from './MachineManager'
import './AdminReports.css' // Uses standard reporting grid and design layouts

type LaminationProduct = {
  id: number
  productName: string
  laminationType: string
  type: string
  count: number
  month: string
  year: string
  isAvailable: boolean
  createdAt: string
}

type LaminationUsageRecord = {
  id: number
  productName: string
  laminationType: string
  type: string
  side: string
  jobId: string
  itemDescription: string
  sheets: number
  completedAt: string
}

export default function LaminationStockManager() {
  const [rolls, setRolls] = useState<LaminationProduct[]>([])
  const [usageRecords, setUsageRecords] = useState<LaminationUsageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'inventory' | 'report' | 'products' | 'workflow' | 'productFlow' | 'boards' | 'machines'>('inventory')

  // Form states
  const [laminationType, setLaminationType] = useState('GLOSS')
  const [sizeType, setSizeType] = useState('12')
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'))
  const [year, setYear] = useState(() => String(new Date().getFullYear()))
  const [customCount, setCustomCount] = useState('')

  // Report Filter states
  const [reportTypeFilter, setReportTypeFilter] = useState('ALL')
  const [reportSideFilter, setReportSideFilter] = useState('ALL')   // single vs double side
  const [reportRollFilter, setReportRollFilter] = useState('ALL')   // dropdown filter for roll code
  const [reportDateFrom, setReportDateFrom] = useState('')          // date range from
  const [reportDateTo, setReportDateTo] = useState('')              // date range to

  const loadData = async () => {
    // The Products / Workflow sub-tabs load their own data.
    if (view !== 'inventory' && view !== 'report') return
    setLoading(true)
    try {
      if (view === 'inventory') {
        const data = await fetchLaminationProducts()
        setRolls(data || [])
      } else {
        const data = await fetchLaminationRollUsageReport()
        setUsageRecords(data || [])
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [view])

  const handleAddRoll = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        laminationType,
        type: sizeType,
        month,
        year,
        count: customCount ? Number(customCount) : undefined
      }
      await createLaminationProduct(payload)
      setCustomCount('')
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create roll stock')
    }
  }

  const handleToggleAvailability = async (id: number, currentStatus: boolean) => {
    try {
      await toggleLaminationProductAvailability(id, !currentStatus)
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update roll availability')
    }
  }

  const handleDeleteRoll = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this roll?')) return
    try {
      await deleteLaminationProduct(id)
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete roll')
    }
  }


  // Unique roll code list for dropdown (from all usage records)
  const rollCodeOptions = ['ALL', ...Array.from(new Set(usageRecords.map(r => r.productName))).sort()]

  // Filter report records
  const filteredReport = usageRecords.filter((r) => {
    if (reportTypeFilter !== 'ALL' && r.laminationType !== reportTypeFilter) return false
    if (reportSideFilter !== 'ALL' && r.side !== reportSideFilter) return false
    if (reportRollFilter !== 'ALL' && r.productName !== reportRollFilter) return false
    // Date range filtering — filter by job completion date
    if (reportDateFrom || reportDateTo) {
      const from = reportDateFrom ? new Date(reportDateFrom).getTime() : 0
      const to = reportDateTo ? new Date(reportDateTo + 'T23:59:59').getTime() : Infinity
      const completed = new Date(r.completedAt).getTime()
      if (completed < from || completed > to) return false
    }
    return true
  })

  const totalSheetsFooter = filteredReport.reduce((sum, r) => sum + (r.sheets || 0), 0)

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setView('inventory')}
          className={`btn-page-luxury ${view === 'inventory' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          📦 Active Inventory
        </button>
        <button
          type="button"
          onClick={() => setView('report')}
          className={`btn-page-luxury ${view === 'report' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          📊 Usage Report
        </button>
        <button
          type="button"
          onClick={() => setView('products')}
          className={`btn-page-luxury ${view === 'products' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          🏷️ Products
        </button>
        <button
          type="button"
          onClick={() => setView('workflow')}
          className={`btn-page-luxury ${view === 'workflow' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          ⚙️ Workflow Steps
        </button>
        <button
          type="button"
          onClick={() => setView('productFlow')}
          className={`btn-page-luxury ${view === 'productFlow' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          🧭 Product Flow
        </button>
        <button
          type="button"
          onClick={() => setView('boards')}
          className={`btn-page-luxury ${view === 'boards' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          🗂️ Board Master
        </button>
        <button
          type="button"
          onClick={() => setView('machines')}
          className={`btn-page-luxury ${view === 'machines' ? 'active' : ''}`}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
        >
          🖨️ Machines
        </button>
      </div>

      {view === 'products' ? (
        <ProductManager />
      ) : view === 'workflow' ? (
        <WorkflowStepManager />
      ) : view === 'productFlow' ? (
        <ProductWorkflowManager />
      ) : view === 'boards' ? (
        <BoardManager />
      ) : view === 'machines' ? (
        <MachineManager />
      ) : view === 'inventory' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem', alignItems: 'start' }}>

          {/* Add Roll Form */}
          <div style={{ background: '#fff', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>✨ Add Lamination Roll</h3>
            <form onSubmit={handleAddRoll} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Lamination Type</label>
                <select
                  value={laminationType}
                  onChange={(e) => setLaminationType(e.target.value)}
                  className="filter-select"
                  style={{ width: '100%', height: '36px' }}
                >
                  <option value="GLOSS">GLOSS</option>
                  <option value="MATT">MATT</option>
                  <option value="VELVET">VELVET</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Size (e.g. 12, 13)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12"
                  value={sizeType}
                  onChange={(e) => setSizeType(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%', height: '36px' }}
                  >
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%', height: '36px' }}
                  >
                    {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() + i)).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Custom Index/Count (Optional)</label>
                <input
                  type="number"
                  placeholder="Auto-calculates if empty"
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', height: '38px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                💾 Save Roll
              </button>

            </form>
          </div>

          {/* Roll List Table */}
          <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading stock details...</div>
            ) : (
              <table className="dispatch-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Roll Code</th>
                    <th>Type</th>
                    <th>Size (Width)</th>
                    <th>Added Date</th>
                    <th>Available</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rolls.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No rolls registered in active inventory.</td>
                    </tr>
                  ) : (
                    rolls.map((roll, idx) => (
                      <tr key={roll.id} className="dispatch-row">
                        <td>{idx + 1}</td>
                        <td><span style={{ fontWeight: 800 }}>{roll.productName}</span></td>
                        <td>
                          <span style={{
                            fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700,
                            background: roll.laminationType === 'GLOSS' ? '#eff6ff' : roll.laminationType === 'MATT' ? '#faf5ff' : '#f0fdf4',
                            color: roll.laminationType === 'GLOSS' ? '#1e40af' : roll.laminationType === 'MATT' ? '#6b21a8' : '#166534'
                          }}>
                            {roll.laminationType}
                          </span>
                        </td>
                        <td>{roll.type}"</td>
                        <td>{new Date(roll.createdAt).toLocaleDateString()}</td>
                        <td>
                          <label className="toggle-label" style={{ margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={roll.isAvailable}
                              onChange={() => handleToggleAvailability(roll.id, roll.isAvailable)}
                            />
                            <span className="toggle-text">{roll.isAvailable ? 'Yes' : 'No'}</span>
                          </label>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRoll(roll.id)}
                            style={{
                              background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                            }}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>
      ) : (
        /* Report View */
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>

            {/* Type dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Type:</span>
              <select
                value={reportTypeFilter}
                onChange={(e) => setReportTypeFilter(e.target.value)}
                className="filter-select"
                style={{ height: '32px' }}
              >
                <option value="ALL">All Types</option>
                <option value="GLOSS">GLOSS</option>
                <option value="MATT">MATT</option>
                <option value="VELVET">VELVET</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            {/* Side dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Side:</span>
              <select
                value={reportSideFilter}
                onChange={(e) => setReportSideFilter(e.target.value)}
                className="filter-select"
                style={{ height: '32px' }}
              >
                <option value="ALL">All Sides</option>
                <option value="SINGLE">Single Side</option>
                <option value="DOUBLE">Double Side</option>
              </select>
            </div>

            {/* Roll Code dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Roll Code:</span>
              <select
                value={reportRollFilter}
                onChange={(e) => setReportRollFilter(e.target.value)}
                className="filter-select"
                style={{ height: '32px', minWidth: '130px' }}
              >
                {rollCodeOptions.map(code => (
                  <option key={code} value={code}>{code === 'ALL' ? 'All Rolls' : code}</option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>From:</span>
              <input
                type="date"
                value={reportDateFrom}
                onChange={(e) => setReportDateFrom(e.target.value)}
                className="form-input"
                style={{ height: '32px', fontSize: '0.78rem', width: '130px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>To:</span>
              <input
                type="date"
                value={reportDateTo}
                onChange={(e) => setReportDateTo(e.target.value)}
                className="form-input"
                style={{ height: '32px', fontSize: '0.78rem', width: '130px' }}
              />
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setReportTypeFilter('ALL'); setReportSideFilter('ALL'); setReportRollFilter('ALL'); setReportDateFrom(''); setReportDateTo(''); }}
              style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', height: '32px' }}
            >
              Reset
            </button>
          </div>

          {/* Usage Table (takes full width) */}
          <div className="dispatch-table-container admin-jobs-table-container" style={{ margin: 0, width: '100%' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading usage records...</div>
            ) : (
              <table className="dispatch-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Roll Code</th>
                    <th>Type</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Job ID</th>
                    <th>Item</th>
                    <th>Sheets Processed</th>
                    <th>Completion Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReport.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No matching usage records found.</td>
                    </tr>
                  ) : (
                    filteredReport.map((r, idx) => (
                      <tr key={r.id} className="dispatch-row">
                        <td>{idx + 1}</td>
                        <td><span style={{ fontWeight: 800 }}>{r.productName}</span></td>
                        <td>
                          <span style={{
                            fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700,
                            background: r.laminationType === 'GLOSS' ? '#eff6ff' : r.laminationType === 'MATT' ? '#faf5ff' : '#f0fdf4',
                            color: r.laminationType === 'GLOSS' ? '#1e40af' : r.laminationType === 'MATT' ? '#6b21a8' : '#166534'
                          }}>
                            {r.laminationType}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700,
                            background: r.side === 'DOUBLE' ? '#fef3c7' : '#e0f2fe',
                            color: r.side === 'DOUBLE' ? '#92400e' : '#075985'
                          }}>
                            {r.side === 'DOUBLE' ? 'Double' : 'Single'}
                          </span>
                        </td>
                        <td>{r.type}"</td>
                        <td><strong style={{ color: '#0f172a' }}>#{r.jobId}</strong></td>
                        <td><span style={{ color: '#475569', fontSize: '0.78rem' }}>{r.itemDescription}</span></td>
                        <td><strong style={{ color: '#2563eb' }}>{r.sheets.toLocaleString()} sheets</strong></td>
                        <td>{new Date(r.completedAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                    <td colSpan={7} style={{ padding: '0.75rem 1rem' }}>Total Sheets Processed:</td>
                    <td colSpan={2} style={{ padding: '0.75rem 1rem', color: '#1e40af' }}>{totalSheetsFooter.toLocaleString()} sheets</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
