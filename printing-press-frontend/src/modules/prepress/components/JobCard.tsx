import React, { useState } from 'react'
import { formatSubject, downloadWithAuth } from '../../../shared/utils/queueHelpers'
import LinkifiedText from '../../../shared/components/LinkifiedText'

interface JobCardProps {
  job: any
  slot: 'queue' | 'walkin'
  profile: any
  selectedBatchJobs: Set<string>
  toggleJobSelection: (id: string) => void
  setShowReassignModal: (id: string) => void
  completeJobMutation: any
  pauseJobMutation: any
  startWalkinJobMutation: any
  setViewImage: (url: string | null) => void
  setDownloadingId: (id: string | null) => void
  walkinJob: any
  backendUrl: string
}

const JobCard: React.FC<JobCardProps> = ({
  job,
  slot,
  profile,
  selectedBatchJobs,
  toggleJobSelection,
  setShowReassignModal,
  completeJobMutation,
  pauseJobMutation,
  startWalkinJobMutation,
  setViewImage,
  walkinJob,
  backendUrl
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  let cleanBody = job.mailBody || ''
  cleanBody = cleanBody.replace(/^---\s*email_body\.txt\s*---\s*\n?/i, '')

  const isImage = (f: string) => ['jpg','jpeg','png','gif','webp'].includes(f.split('.').pop()?.toLowerCase() || '')
  const visibleAtts = (atts: string[]) => {
    if (!atts || !Array.isArray(atts)) return [];
    return atts.filter(f => !/\.(txt|html|htm)$/i.test(f));
  }

  const priorityInfo = (() => {
    const score = job.priorityScore || 0
    if (score >= 20) return { class: 'priority-immediate', label: 'CRITICAL', color: '#ef4444' }
    if (score >= 10) return { class: 'priority-high', label: 'URGENT', color: '#dc2626' }
    if (score >= 5)  return { class: 'priority-medium', label: 'HIGH', color: '#f59e0b' }
    return { class: 'priority-low', label: '', color: '' }
  })()

  const attachments = visibleAtts(job.files || job.attachments || []);

  return (
    <div className={`active-job-card-supreme ${priorityInfo.class} ${selectedBatchJobs.has(job._id) ? 'is-selected-batch' : ''}`}>
      {/* Top Header Row */}
      <div className="job-card-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Selection Checkbox */}
          <div className="job-selection-wrapper" onClick={(e) => { e.stopPropagation(); toggleJobSelection(job._id); }} style={{ position: 'relative', top: 'auto', left: 'auto', marginRight: '0.25rem' }}>
             <div className={`job-checkbox ${selectedBatchJobs.has(job._id) ? 'checked' : ''}`}>
               {selectedBatchJobs.has(job._id) && '✓'}
             </div>
          </div>
          <div className="job-badge-black">JOB</div>
          <div className="job-hash-gray">#{job._id.substring(job._id.length - 6).toUpperCase()}</div>
          {priorityInfo.label && (
            <div 
              style={{ background: priorityInfo.color, color: 'white', fontWeight: 800, fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: '2rem', letterSpacing: '0.05em', animation: 'pulse-revision 2s infinite' }}
            >
              {priorityInfo.label}
            </div>
          )}
          {job.reassignedFrom && (
            <div 
              className="handoff-alert-bubble"
              style={{ 
                display: 'flex', flexDirection: 'column', gap: '0.2rem', 
                background: '#fff7ed', border: '1px solid #ffedd5', color: '#9a3412',
                padding: '0.4rem 1rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 700,
                maxWidth: '400px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.9rem' }}>⤨</span>
                <span style={{ fontWeight: 800 }}>FROM {job.reassignedFrom.name?.toUpperCase() || 'PREVIOUS'}</span>
              </div>
              {job.staffHandoffReason && (
                  <div style={{ opacity: 0.8, fontSize: '0.65rem', borderLeft: '2px solid #fdba74', paddingLeft: '0.5rem', marginTop: '0.2rem' }}>
                      Requested: "{job.staffHandoffReason}"
                  </div>
              )}
              {job.adminHandoffNotes && (
                  <div style={{ fontWeight: 800, color: '#c2410c' }}>
                      Admin: "{job.adminHandoffNotes}"
                  </div>
              )}
            </div>
          )}
        </div>
        <button
          className="reassign-icon-btn"
          onClick={() => setShowReassignModal(job._id)}
          disabled={job.status === 'PAUSED'}
          title="Reassign Job"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>

      {/* Main Body Column */}
      <div className="job-body-supreme" style={{ marginTop: '0.75rem' }}>
        {/* Customer & Subject */}
        <div className="job-card-title-group">
          {job.type === 'WHATSAPP' && job.customerEmail ? (
             <h1 className="job-customer-massive" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {job.customerName || 'Walk-in Customer'}
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '2rem', border: '1px solid #d1fae5' }}>
                   📱 {job.customerEmail.split('@')[0]}
                </span>
             </h1>
          ) : job.type === 'WALKIN' && job.customerPhone ? (
            <h1 className="job-customer-massive" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               {job.customerName || 'Walk-in Customer'}
               <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '2rem', border: '1px solid #d1fae5' }}>
                  📞 {job.customerPhone}
               </span>
            </h1>
          ) : (
             <h1 className="job-customer-massive">{job.customerName || 'Walk-in Customer'}</h1>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            {(() => {
              const { time, clean } = formatSubject(job.emailSubject || '')
              return (
                <>
                  {time && (
                    <span style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 800, 
                      color: '#4338ca', 
                      background: '#eef2ff', 
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '0.5rem', 
                      border: '1px solid #c7d2fe',
                      letterSpacing: '-0.01em',
                      display: 'inline-block',
                      fontFamily: 'Inter, system-ui, sans-serif'
                    }}>
                      {time}
                    </span>
                  )}
                  <h3 className="job-subject-sub" style={{ margin:0 }}>
                    {clean || (job.type === 'WALKIN' ? job.walkinDescription : 'No Subject')}
                  </h3>
                </>
              )
            })()}
          </div>
        </div>

        {/* Mail Body / Notes Container */}
        {(cleanBody || job.walkinDescription) && (
          <div className={`job-mail-box-gray ${isExpanded ? 'expanded' : ''}`} style={{ marginTop: '0.75rem' }}>
            <pre className="mail-pre-text" style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight: isExpanded ? 'none' : undefined }}>
              <LinkifiedText text={cleanBody || job.walkinDescription} />
            </pre>
            {(cleanBody || job.walkinDescription).length > 200 && (
              <button 
                className="mail-expand-btn"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? '↑ SHOW LESS' : '↓ READ MORE'}
              </button>
            )}
          </div>
        )}

        {/* Cloud Links */}
        {Array.isArray(job.externalLinks) && job.externalLinks.length > 0 && (
          <div className="external-links-premium" style={{ marginTop: '0.75rem' }}>
            <div className="section-divider-text" style={{ marginBottom: '0.5rem' }}><span>☁ Cloud Files</span></div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
              {job.externalLinks.map((link: any, idx: number) => (
                <a 
                  key={idx} 
                  href={link.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-supreme-link"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.7rem', borderRadius: '0.5rem' }}
                >
                  {link.title?.toUpperCase() || 'LINK ' + (idx + 1)}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Attachments Section - Back above buttons */}
        {attachments.length > 0 && (
          <div className="attachments-supreme" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', margin: 0, textTransform: 'uppercase' }}>
                Attachments ({attachments.length})
              </h4>
              <button 
                onClick={() => {
                  const url = `${backendUrl}/api/attachments/${job._id}/download-all`;
                  const cleanSubject = (job.emailSubject || 'Job').replace(/[/\\?%*:|"<>]/g, '-');
                  downloadWithAuth(url, `${cleanSubject}.zip`);
                }}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Download All (ZIP)
              </button>
            </div>
            <div className="attachments-grid-supreme">
              {attachments.map((file: string, idx: number) => {
                const fileUrl = `${backendUrl}/api/queue/files/${job._id}/${file}?token=${localStorage.getItem('token')}`
                return (
                  <div 
                    key={idx} 
                    className="att-thumb-supreme" 
                    title={file} 
                    onClick={() => {
                      if (isImage(file)) {
                        setViewImage(fileUrl);
                      } else {
                        const cleanUrl = fileUrl.split('?')[0];
                        downloadWithAuth(cleanUrl, file);
                      }
                    }}
                  >
                    {isImage(file) ? (
                      <img src={fileUrl} alt={file} />
                    ) : (
                      <div className="file-icon-placeholder">
                        <span>{file.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    {/* Filename Overlay on Hover */}
                    <div className="att-hover-name">{file}</div>
                    {/* Mini Download Button Overlay */}
                    <button 
                      className="mini-dl-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const cleanUrl = fileUrl.split('?')[0];
                        downloadWithAuth(cleanUrl, file);
                      }}
                      title="Download File"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Handled By */}
      <div className="job-meta-bar-supreme" style={{ marginTop: '0.5rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className="handled-by-pill" style={{ padding: '0.2rem 0.5rem', fontSize: '0.6rem' }}>
          <span className="staff-initials">{(job.assignedTo?.name || profile?.name || 'U').charAt(0).toUpperCase()}</span>
          HANDLED BY {job.assignedTo?.name || profile?.name || 'YOU'}
        </div>
        {(job.returnReason || job.isTimeout) && (
           <span style={{ fontSize:'0.6rem', fontWeight:850, color:'#991b1b', background:'#fef2f2', padding:'0.2rem 0.5rem', borderRadius:'2rem' }}>
             ⚠ {job.isTimeout ? 'TIMEOUT' : (job.returnReason || 'RETURNED').toUpperCase()}
           </span>
        )}
      </div>

      {/* Footer Actions */}
      <div className="job-footer-supreme" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {job.status !== 'PAUSED' && (
          <button
            className="btn-supreme-black"
            style={{
              padding: '0.75rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 800,
              borderRadius: '0.4rem',
              flex: 'none',
              width: '110px',
              textAlign: 'center'
            }}
            onClick={() => completeJobMutation.mutate(job._id)}
            disabled={completeJobMutation.isPending || (slot === 'queue' && !!walkinJob)}
          >
            {completeJobMutation.isPending ? 'COMPLETING…' : 'MARK COMPLETE'}
          </button>
        )}

        {slot === 'queue' && job.status !== 'PAUSED' && !walkinJob && (
            <button
              className="btn-supreme-outline-orange"
              style={{
                padding: '0.75rem 0.5rem',
                fontSize: '0.7rem',
                fontWeight: 800,
                borderRadius: '0.4rem',
                border: '2px solid #f59e0b',
                color: '#b45309',
                background: 'white',
                flex: 'none',
                width: '110px',
                textAlign: 'center'
              }}
              onClick={() => pauseJobMutation.mutate({ jobId: job._id, fetchNext: true })}
              disabled={pauseJobMutation.isPending}
              title="Hold this job and get the next one in queue"
            >
              HOLD & NEXT
            </button>
        )}

        {/* Simple HOLD Button */}
        {job.status !== 'PAUSED' && (
          <button 
            className="btn-supreme-outline-orange" 
            style={{
              padding: '0.75rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 800,
              borderRadius: '0.4rem',
              border: '2px solid #f97316',
              color: '#ea580c',
              background: 'white',
              flex: 'none',
              width: '110px',
              textAlign: 'center'
            }}
            onClick={() => pauseJobMutation.mutate({ jobId: job._id, fetchNext: false })}
            disabled={pauseJobMutation.isPending}
          >
            HOLD
          </button>
        )}

        {/* RESUME Button */}
        {job.status === 'PAUSED' && (
          <button 
            className="btn-supreme-outline-blue" 
            style={{
              padding: '0.75rem 0.5rem',
              fontSize: '0.7rem',
              fontWeight: 800,
              borderRadius: '0.4rem',
              border: '2px solid #3b82f6',
              color: '#2563eb',
              background: 'white',
              flex: 'none',
              width: '110px',
              textAlign: 'center'
            }}
            onClick={() => startWalkinJobMutation.mutate({ jobId: job._id })}
            disabled={startWalkinJobMutation.isPending}
          >
            {startWalkinJobMutation.isPending ? 'RESUMING...' : 'RESUME'}
          </button>
        )}
      </div>
    </div>
  )
}

export default JobCard
