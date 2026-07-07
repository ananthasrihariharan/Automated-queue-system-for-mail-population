import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import UserMenu from '@core/components/UserMenu'
import ModuleNavigation from '@core/components/ModuleNavigation'
import WorkflowJobDetailsModal from '@core/components/WorkflowJobDetailsModal'
import { workflowPipelineLabel } from '@core/utils/workflowStages'
import './PrepressDashboard.css'
import { fetchPrepressJobs, fetchJobStatus } from '@core/services/api'
import { getBackendUrl } from '@core/utils/backendUrl'
import { useQuery } from '@tanstack/react-query'
import Pagination from '@core/components/Pagination'
import DateFilter from '@core/components/DateFilter'

type Job = {
  jobId: string
  customerName: string
  customerPhone?: string
  totalItems: number
  paymentStatus: string
  jobStatus?: string
  createdAt: string
  itemScreenshots: string[]
  items?: any[]
}

const STAGE_LABELS: Record<string, string> = {
  press: 'Press',
  lamination: 'Lamination',
  foil: 'Foil',
  binding: 'Binding',
  fusing: 'Fusing',
  holes: 'Holes',
  cutting: 'Cutting',
  creasing: 'Creasing',
  dieCutting: 'Die Cut',
  cornerCutting: 'Corner Cut',
  cutting2: 'Cutting 2',
}

const BACKEND_URL = getBackendUrl()

export default function PrepressDashboard() {
  const [_statusLoading, setStatusLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  const { data: responseData, isLoading } = useQuery({
    queryKey: ['prepress-jobs', currentPage, search, paymentFilter, dateFilter],
    queryFn: () => fetchPrepressJobs(currentPage, itemsPerPage, search, paymentFilter, dateFilter),
    refetchInterval: 10000,
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
  })

  const jobs = Array.isArray(responseData) ? responseData : (responseData?.jobs || [])
  const totalPages = responseData?.pages || 1

  const [previewJob, setPreviewJob] = useState<Job | null>(null)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [statusJob, setStatusJob] = useState<any | null>(null)


  const openStatus = async (jobId: string) => {
    setStatusLoading(true)
    try {
      const data = await fetchJobStatus(jobId)
      setStatusJob(data)
    } catch {
      alert('Failed to load job status.')
    } finally {
      setStatusLoading(false)
    }
  }

  const navigate = useNavigate()



  if (isLoading && !responseData) return <div className="prepress-page">Loading...</div>

  return (
    <div className="prepress-page">
      <div className="prepress-navbar">
        <div className="prepress-navbar-left">
          <h1 className="prepress-title">Prepress</h1>
          <button
            onClick={() => navigate('/prepress/create')}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
          >
            + NEW JOB
          </button>
          <button
            onClick={() => navigate('/prepress/queue')}
            className="btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h10" />
            </svg>
            QUEUE MODE
          </button>
        </div>
        <div className="prepress-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      <div className="prepress-filters-bar">
        <div className="filter-group">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          <div className="search-wrapper">
            <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search Job ID or Customer..."
              className="filter-input search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="dropdown-wrapper">
            <select
              className="filter-select"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
            >
              <option value="ALL">Payment: All</option>
              <option value="UNPAID">Unpaid Only</option>
              <option value="PAID">Paid Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewJob && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Job Details: {previewJob.jobId}</h2>
              <button className="close-btn" onClick={() => setPreviewJob(null)}>&times;</button>
            </div>
            <div className="job-info-grid">
              <div>
                <p>Customer</p>
                <span>{previewJob.customerName} {previewJob.customerPhone && `(${previewJob.customerPhone})`}</span>
              </div>
              <div>
                <p>Total Items</p>
                <span>{previewJob.totalItems}</span>
              </div>
              <div>
                <p>Created At</p>
                <span>{new Date(previewJob.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <p>Payment Status</p>
                <span className={`status-badge ${previewJob.paymentStatus === 'PAID' || previewJob.paymentStatus === 'ADMIN_APPROVED' ? 'status-paid' : 'status-unpaid'}`}>
                  {previewJob.paymentStatus}
                </span>
              </div>
            </div>
            <div>
              <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Item Screenshots ({previewJob.itemScreenshots.length})
              </h3>
              {previewJob.itemScreenshots.length > 0 ? (
                <div className="screenshots-grid">
                  {previewJob.itemScreenshots.map((path, idx) => {
                    const filename = path.split(/[\\/]/).pop() || `Item ${idx + 1}`
                    return (
                      <div key={idx} className="screenshot-item">
                        <img
                          src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                          alt={filename}
                          onClick={() => setViewImage(`${BACKEND_URL}/${path.replace(/\\/g, '/')}`)}
                        />
                        <div className="attachment-filename-label">{filename}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No screenshots uploaded.</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setPreviewJob(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Job ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📋</div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b' }}>No jobs found</div>
                  <p style={{ marginTop: '0.5rem' }}>Use the search bar or select a date to view jobs.</p>
                </td>
              </tr>
            ) : (
              jobs.map((job: Job, index: number) => (
                <tr key={job.jobId} style={{ cursor: 'pointer' }} onClick={() => openStatus(job.jobId)}>
                  <td><span style={{ fontWeight: 600, color: '#64748b' }}>{(currentPage - 1) * itemsPerPage + index + 1}</span></td>
                  <td style={{ fontWeight: 800 }}>{job.jobId}</td>
                  <td>{job.customerName}</td>
                  <td>{job.totalItems}</td>
                  <td>
                    <span className={`status-badge ${job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED' ? 'status-paid' : 'status-unpaid'}`}>
                      {job.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {(() => {
                        const activeStages = Array.from(
                          new Set(
                            job.items
                              ?.map((item: any) => item.activeStage)
                              .filter((stage: string) => stage && stage !== 'done') || []
                          )
                        ) as string[]

                        if (activeStages.length === 0) {
                          const statusText = job.jobStatus ? job.jobStatus.replace(/_/g, ' ').toUpperCase() : 'PENDING'
                          return (
                            <span className="status-badge status-approved" style={{ fontSize: '0.7rem' }}>
                              {statusText}
                            </span>
                          )
                        }

                        return activeStages.map((stage) => {
                          const label = STAGE_LABELS[stage] || stage.toUpperCase()
                          return (
                            <span key={stage} className="status-badge" style={{ background: '#e2e8f0', color: '#1e293b', fontSize: '0.7rem' }}>
                              {label}
                            </span>
                          )
                        })
                      })()}
                    </div>
                  </td>
                  <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="actions-wrapper">
                      <button className="btn-secondary btn-sm" onClick={() => setPreviewJob(job)}>View</button>
                      <button className="btn-primary btn-sm" onClick={() => navigate(`/prepress/edit/${job.jobId}`)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      {/* Lightbox */}
      {viewImage && (
        <div
          onClick={() => setViewImage(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out'
          }}
        >
          <img src={viewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }} />
        </div>
      )}

      {statusJob && (
        <WorkflowJobDetailsModal
          job={statusJob}
          onClose={() => setStatusJob(null)}
          workflowLabel={workflowPipelineLabel(statusJob)}
          workflowTask={null}
          showAllItems
          showLogs={false}
        />
      )}
    </div>
  )
}
