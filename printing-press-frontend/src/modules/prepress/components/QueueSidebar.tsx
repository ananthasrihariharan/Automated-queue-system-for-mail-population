import React from 'react'
import { elapsed } from '../../../shared/utils/queueHelpers'

interface QueueSidebarProps {
  sidebarTab: 'WALKIN' | 'QUEUE' | 'HISTORY' | 'SEARCH'
  setSidebarTab: (tab: 'WALKIN' | 'QUEUE' | 'HISTORY' | 'SEARCH') => void
  pendingWalkins: any[]
  pendingQueue: any[]
  historySearch: string
  setHistorySearch: (search: string) => void
  filteredHistory: any[]
  poolSearch: string
  setPoolSearch: (search: string) => void
  generalPool: any[]
  setPreviewJob: (job: any) => void
  startWalkinJobMutation: any
}

const QueueSidebar: React.FC<QueueSidebarProps> = ({
  sidebarTab,
  setSidebarTab,
  pendingWalkins,
  pendingQueue,
  historySearch,
  setHistorySearch,
  filteredHistory,
  poolSearch,
  setPoolSearch,
  generalPool,
  setPreviewJob,
  startWalkinJobMutation
}) => {
  return (
    <div className="sidebar-supreme">
      <div className="sidebar-tab-nav">
        <button className={`sidebar-tab-btn ${sidebarTab === 'WALKIN' ? 'active' : ''}`} onClick={() => setSidebarTab('WALKIN')}>
          WALK-INS
          {pendingWalkins.length > 0 && <span className="tab-badge-dot" />}
        </button>
        <button className={`sidebar-tab-btn ${sidebarTab === 'QUEUE' ? 'active' : ''}`} onClick={() => setSidebarTab('QUEUE')}>
          MY QUEUE
          {pendingQueue.length > 0 && <span className="tab-badge-dot blue" />}
        </button>
        <button className={`sidebar-tab-btn ${sidebarTab === 'SEARCH' ? 'active' : ''}`} onClick={() => setSidebarTab('SEARCH')}>
          FIND JOB
        </button>
        <button className={`sidebar-tab-btn ${sidebarTab === 'HISTORY' ? 'active' : ''}`} onClick={() => setSidebarTab('HISTORY')}>
          HISTORY
        </button>
      </div>

      <div className="sidebar-tab-content">
        {sidebarTab === 'WALKIN' && (
          <div className="sidebar-list-view">
            {!Array.isArray(pendingWalkins) || pendingWalkins.length === 0 ? (
              <div className="sidebar-empty-state">
                <span className="sidebar-empty-icon">🤝</span>
                <span className="sidebar-empty-text">No active walk-ins</span>
                <span className="sidebar-empty-sub">Scan the QR code to start a walk-in job.</span>
              </div>
            ) : (
              pendingWalkins.map((job: any) => (
                <div key={job._id} className={`sidebar-job-row ${job.status === 'PAUSED' ? 'is-on-hold' : ''}`} onClick={() => setPreviewJob(job)}>
                  <div className="sj-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div className="sj-name">{job.customerName}</div>
                      {job.status === 'PAUSED' && (
                        <span style={{ fontSize: '0.65rem', background: '#fef2f2', color: '#dc2626', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: 900, border: '1px solid #fee2e2' }}>HOLD</span>
                      )}
                    </div>
                    <div className="sj-meta">
                      {job.status === 'PAUSED' ? `Reason: ${job.pauseReason || 'General Hold'}` : (job.createdAt ? `${elapsed(job.createdAt)} ago` : 'New')}
                    </div>
                  </div>
                  <button 
                    className={`sj-action-btn ${job.status === 'PAUSED' ? 'orange' : 'green'}`} 
                    onClick={(e) => { e.stopPropagation(); startWalkinJobMutation.mutate({ jobId: job._id }); }}
                  >
                    {startWalkinJobMutation.isPending ? '...' : (job.status === 'PAUSED' ? 'RESUME' : 'TAKE')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {sidebarTab === 'QUEUE' && (
          <div className="sidebar-list-view">
            {!Array.isArray(pendingQueue) || pendingQueue.length === 0 ? (
              <div className="sidebar-empty-state">
                <span className="sidebar-empty-icon">📂</span>
                <span className="sidebar-empty-text">Queue is clear</span>
                <span className="sidebar-empty-sub">Pinned jobs or batch items show up here.</span>
              </div>
            ) : (
              pendingQueue.map((job: any) => (
                <div key={job._id} className={`sidebar-job-row ${job.status === 'PAUSED' ? 'is-on-hold' : ''}`} onClick={() => setPreviewJob(job)}>
                  <div className="sj-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div className="sj-name">{job.customerName}</div>
                      {job.status === 'PAUSED' && (
                        <span style={{ fontSize: '0.65rem', background: '#fef2f2', color: '#dc2626', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: 900, border: '1px solid #fee2e2' }}>HOLD</span>
                      )}
                    </div>
                    <div className="sj-meta">
                      {job.status === 'PAUSED' ? `Reason: ${job.pauseReason || 'General Hold'}` : `${job.emailSubject?.substring(0, 20)}...`}
                    </div>
                  </div>
                  <button 
                    className={`sj-action-btn ${job.status === 'PAUSED' ? 'orange' : 'blue'}`} 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      startWalkinJobMutation.mutate({ jobId: job._id });
                    }}
                  >
                    {startWalkinJobMutation.isPending ? '...' : (job.status === 'PAUSED' ? 'RESUME' : 'TAKE')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {sidebarTab === 'HISTORY' && (
          <div className="sidebar-list-view">
            <div className="history-search-wrapper">
              <span className="history-search-icon-fixed">🔍</span>
              <input 
                type="text" 
                placeholder="Search history..." 
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="history-search-input"
              />
            </div>
            <div className="sidebar-scroll-mini" style={{ padding: '0 0.5rem' }}>
              {!historySearch.trim() ? (
                <div className="sidebar-empty-state">
                  <span className="sidebar-empty-icon">🔎</span>
                  <span className="sidebar-empty-text">Archive Search</span>
                  <span className="sidebar-empty-sub">Type a name or subject to view past jobs.</span>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="sidebar-empty-state">
                   <span className="sidebar-empty-icon">⚠️</span>
                   <span className="sidebar-empty-text">No matches found</span>
                </div>
              ) : (
                filteredHistory.map((job: any) => (
                  <div key={job._id} className="sidebar-job-row" onClick={() => setPreviewJob(job)}>
                    <div className="sj-main">
                      <div className="sj-name">{job.customerName}</div>
                      <div className="sj-meta">{new Date(job.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span className={`sj-badge ${job.type === 'WHATSAPP' ? 'wa' : ''}`}>
                      {job.type === 'WHATSAPP' ? 'WA' : job.type}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {sidebarTab === 'SEARCH' && (
          <div className="sidebar-list-view">
            <div className="history-search-wrapper">
              <span className="history-search-icon-fixed">🔎</span>
              <input 
                type="text" 
                placeholder="Search waiting pool..." 
                value={poolSearch}
                onChange={e => setPoolSearch(e.target.value)}
                className="history-search-input"
              />
            </div>
            <div className="sidebar-scroll-mini" style={{ padding: '0 0.5rem' }}>
              {poolSearch.trim().length < 2 ? (
                <div className="sidebar-empty-state">
                  <span className="sidebar-empty-icon">🔎</span>
                  <span className="sidebar-empty-text">Type to search pool</span>
                  <span className="sidebar-empty-sub">Enter at least 2 characters to find jobs.</span>
                </div>
              ) : !Array.isArray(generalPool) || generalPool.length === 0 ? (
                <div className="sidebar-empty-state">
                  <span className="sidebar-empty-icon">📭</span>
                  <span className="sidebar-empty-text">No matches found</span>
                  <span className="sidebar-empty-sub">Try searching by name or subject.</span>
                </div>
              ) : (
                generalPool.map((job: any) => (
                  <div key={job._id} className="sidebar-job-row" onClick={() => setPreviewJob(job)}>
                    <div className="sj-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div className="sj-name">{job.customerName}</div>
                        {job.batchCount > 1 && (
                          <span className="sj-badge-batch" style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: 900, border: '1px solid #dbeafe' }}>
                            {job.batchCount} JOBS
                          </span>
                        )}
                      </div>
                      <div className="sj-meta">
                        {['ASSIGNED', 'IN_PROGRESS'].includes(job.status) ? (
                          <span style={{ color: '#10b981', fontWeight: 800 }}>
                            🛠️ {job.assignedTo?.name || 'Staff'}'s Workspace
                          </span>
                        ) : job.status === 'PAUSED' ? (
                          <span style={{ color: '#ea580c', fontWeight: 800 }}>
                            ⚠️ Held by {job.assignedTo?.name || 'Staff'}
                          </span>
                        ) : job.pinnedToStaff ? (
                          <span style={{ color: '#2563eb', fontWeight: 800 }}>
                            📌 Pinned to {job.pinnedToStaff?.name || 'Staff'}
                          </span>
                        ) : (
                          `${job.emailSubject?.substring(0, 30)}...`
                        )}
                      </div>
                    </div>
                    <div className="sj-actions-group" style={{ display: 'flex', gap: '0.4rem' }}>
                      {['ASSIGNED', 'IN_PROGRESS'].includes(job.status) ? (
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.4rem' }}>Locked</div>
                      ) : job.batchCount > 1 ? (
                        <>
                          <button 
                            className="sj-action-btn blue-ghost"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const ownerName = job.assignedTo?.name || job.pinnedToStaff?.name;
                              if (ownerName && !window.confirm(`This job is currently held/pinned by ${ownerName}. Are you sure you want to take it?`)) {
                                return;
                              }
                              startWalkinJobMutation.mutate({ jobId: job._id, takeAll: false });
                            }}
                          >
                            TAKE ONE
                          </button>
                          <button 
                            className="sj-action-btn blue"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const ownerName = job.assignedTo?.name || job.pinnedToStaff?.name;
                              if (ownerName && !window.confirm(`This job is currently held/pinned by ${ownerName} and its batch. Are you sure you want to take ALL?`)) {
                                return;
                              }
                              startWalkinJobMutation.mutate({ jobId: job._id, takeAll: true });
                            }}
                          >
                            TAKE ALL
                          </button>
                        </>
                      ) : (
                        <button 
                          className="sj-action-btn blue"
                          onClick={(e) => {
                            e.stopPropagation();
                            const ownerName = job.assignedTo?.name || job.pinnedToStaff?.name;
                            if (ownerName && !window.confirm(`This job is currently held/pinned by ${ownerName}. Are you sure you want to take it?`)) {
                              return;
                            }
                            startWalkinJobMutation.mutate({ jobId: job._id, takeAll: false });
                          }}
                        >
                          {startWalkinJobMutation.isPending ? '...' : 'TAKE'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QueueSidebar
