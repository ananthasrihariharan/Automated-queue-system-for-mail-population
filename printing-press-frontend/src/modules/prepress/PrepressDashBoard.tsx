import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import './PrepressDashboard.css'
import { fetchPrepressJobs } from '../../services/api'
import { useQuery } from '@tanstack/react-query'
type Job = {
  jobId: string
  customerName: string
  customerPhone?: string
  totalItems: number
  paymentStatus: string
  createdAt: string
  itemScreenshots: string[]
}


import Pagination from '../../components/Pagination'
import DateFilter from '../../components/DateFilter'

const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || '')

// ... existing imports

export default function PrepressDashboard() {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }) 

  const {
    data: responseData,
    isLoading,
  } = useQuery({
    queryKey: ['prepress-jobs', currentPage, search, paymentFilter, dateFilter],
    queryFn: () => fetchPrepressJobs(currentPage, itemsPerPage, search, paymentFilter, dateFilter),
    refetchInterval: 10000, 
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
  })

  // Handle both legacy (array) and new (object) API responses
  const jobs = Array.isArray(responseData) ? responseData : (responseData?.jobs || [])
  const totalPages = responseData?.pages || 1

  const [previewJob, setPreviewJob] = useState<Job | null>(null)
  const [viewImage, setViewImage] = useState<string | null>(null)

  const navigate = useNavigate()

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Server-side filtering is now handled by the query above.
  const filteredJobs = jobs

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
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'linear-gradient(to right, #6366f1, #8b5cf6)', border: 'none' }}
          >
            QUEUE MODE
          </button>
        </div>

        <div className="prepress-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      {/* Premium Filter Bar */}
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
              <button className="close-btn" onClick={() => setPreviewJob(null)}>
                &times;
              </button>
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
                <span
                  className={`status-badge ${previewJob.paymentStatus === 'PAID' || previewJob.paymentStatus === 'ADMIN_APPROVED'
                    ? 'status-paid'
                    : 'status-unpaid'
                    }`}
                >
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
                  {previewJob.itemScreenshots.map((path, idx) => (
                    <div key={idx} className="screenshot-item">
                      <img
                        src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                        alt={`Item ${idx + 1}`}
                        onClick={() => setViewImage(`${BACKEND_URL}/${path.replace(/\\/g, '/')}`)}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No screenshots uploaded.</p>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={() => setPreviewJob(null)}>
                Close
              </button>
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
              <th>Created</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredJobs.map((job: Job, index: number) => (
              <tr key={job.jobId}>
                <td><span style={{ fontWeight: 600, color: '#64748b' }}>{index + 1}</span></td>
                <td>{job.jobId}</td>
                <td>{job.customerName}</td>
                <td>{job.totalItems}</td>
                <td>
                  <span className={`status-badge ${job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED' ? 'status-paid' : 'status-unpaid'}`}>
                    {job.paymentStatus}
                  </span>
                </td>
                <td>{new Date(job.createdAt).toLocaleDateString()}</td>
                <td className="actions-cell">
                  <div className="actions-wrapper">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setPreviewJob(job)}
                    >
                      View
                    </button>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => navigate(`/prepress/edit/${job.jobId}`)}
                    >
                      Edit
                    </button>
                    {job.itemScreenshots && job.itemScreenshots.length > 1 && (
                      <button
                        className="btn-download-premium btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${BACKEND_URL}/api/attachments/${job.jobId}/download-all`;
                          handleDownload(url, `${job.jobId}_all.zip`);
                        }}
                      >
                        Download All
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      {/* Lightbox Modal */}
      {viewImage && (
        <div
          className="lightbox-modal"
          onClick={() => setViewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div className="lightbox-content" style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={viewImage}
              alt="Preview"
              className="lightbox-img"
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }}
            />
            <button
              className="lightbox-close-btn"
              onClick={() => setViewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-10px',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
