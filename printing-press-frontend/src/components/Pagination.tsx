import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages = [];

        // If specific logic is needed for very small number of pages, handle here
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            if (currentPage > 3) {
                pages.push('...');
            }

            // Logic to show pages around current page
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            // Adjust if we are near the beginning
            if (currentPage <= 3) {
                start = 2;
                end = 4;
            }

            // Adjust if we are near the end
            if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
                end = totalPages - 1;
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('...');
            }

            // Always show last page
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="pagination-container" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center' }}>
            <button
                className="btn-secondary"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
                style={{ minWidth: 'auto', padding: '0.5rem 1rem' }}
            >
                Previous
            </button>

            {getPageNumbers().map((page, index) => (
                <React.Fragment key={index}>
                    {page === '...' ? (
                        <span style={{ padding: '0 0.5rem', color: '#6b7280', alignSelf: 'center' }}>...</span>
                    ) : (
                        <button
                            className={`btn-secondary ${currentPage === page ? 'active' : ''}`}
                            style={{
                                minWidth: '2.5rem',
                                background: currentPage === page ? '#000' : '',
                                color: currentPage === page ? '#fff' : '',
                            }}
                            onClick={() => onPageChange(Number(page))}
                        >
                            {page}
                        </button>
                    )}
                </React.Fragment>
            ))}

            <button
                className="btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                style={{ minWidth: 'auto', padding: '0.5rem 1rem' }}
            >
                Next
            </button>
        </div>
    );
}
