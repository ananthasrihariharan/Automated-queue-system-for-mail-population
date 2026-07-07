import React, { useRef, useEffect, useState } from 'react'
import type { LayoutResult, Placement } from '../utils/layoutEngine'

interface LayoutPreviewModalProps {
  layout: LayoutResult
  onClose: () => void
}

export const LayoutPreviewModal: React.FC<LayoutPreviewModalProps> = ({ layout, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Zoom and Pan states
  const [zoom, setZoom] = useState<number>(1.0)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState<boolean>(false)
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false)
  const [selectedJob, setSelectedJob] = useState<Placement | null>(null)

  // Track drag positions
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Listen to keyboard space bar for panning shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setIsSpacePressed(true)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Auto-resize canvas
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Rendering logic via Canvas 2D Context
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions with high-DPI device pixel support
    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    ctx.scale(dpr, dpr)

    // Clear and draw background
    ctx.fillStyle = '#ECECEC'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    // Base scale calculations: Fit the sheet inside 75% of the viewport width/height
    const marginPercent = 0.75
    const baseScaleX = (dimensions.width * marginPercent) / layout.sheetWidth
    const baseScaleY = (dimensions.height * marginPercent) / layout.sheetHeight
    const baseScale = Math.min(baseScaleX, baseScaleY)
    
    const scale = baseScale * zoom

    // Center layout coordinates relative to viewport
    const sheetPxW = layout.sheetWidth * scale
    const sheetPxH = layout.sheetHeight * scale
    const startX = (dimensions.width - sheetPxW) / 2 + panOffset.x
    const startY = (dimensions.height - sheetPxH) / 2 + panOffset.y

    // Helper functions to map layout millimeters to viewport pixel coordinates
    const toPxX = (mmX: number) => startX + mmX * scale
    const toPxY = (mmY: number) => startY + mmY * scale
    const toPxLen = (mmLen: number) => mmLen * scale

    // 1. Draw Sheet Background
    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)'
    ctx.shadowBlur = 15
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 6
    ctx.fillRect(startX, startY, sheetPxW, sheetPxH)
    ctx.shadowColor = 'transparent' // Reset shadow

    // Draw sheet outer border
    ctx.strokeStyle = '#D1D5DB'
    ctx.lineWidth = 1
    ctx.strokeRect(startX, startY, sheetPxW, sheetPxH)

    // 2. Draw Margins (Printable Area boundaries)
    const marginL = layout.margin.left
    const marginR = layout.margin.right
    const marginT = layout.margin.top
    const marginB = layout.margin.bottom

    const printX = toPxX(marginL)
    const printY = toPxY(marginT)
    const printW = toPxLen(layout.printableWidth)
    const printH = toPxLen(layout.printableHeight)

    ctx.strokeStyle = '#9CA3AF'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.strokeRect(printX, printY, printW, printH)
    ctx.setLineDash([]) // Reset dash pattern

    // 3. Draw Printable Area Shaded Background (represent remaining/waste area inside printable)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)' // Light Red waste shading
    ctx.fillRect(printX, printY, printW, printH)

    // Add "Printable Area" watermark text
    ctx.fillStyle = 'rgba(16, 185, 129, 0.09)'
    ctx.font = `bold ${Math.max(12, toPxLen(12))}px Outfit, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Printable Area', printX + printW / 2, printY + printH / 2)

    // 4. Draw optional 10mm grid inside printable area (only when zoomed in enough)
    if (zoom >= 0.8) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)'
      ctx.lineWidth = 0.5
      const gridSizeMm = 10

      // Vertical grid lines
      for (let xMm = marginL + gridSizeMm; xMm < layout.sheetWidth - marginR; xMm += gridSizeMm) {
        ctx.beginPath()
        ctx.moveTo(toPxX(xMm), printY)
        ctx.lineTo(toPxX(xMm), printY + printH)
        ctx.stroke()
      }
      // Horizontal grid lines
      for (let yMm = marginT + gridSizeMm; yMm < layout.sheetHeight - marginB; yMm += gridSizeMm) {
        ctx.beginPath()
        ctx.moveTo(printX, toPxY(yMm))
        ctx.lineTo(printX + printW, toPxY(yMm))
        ctx.stroke()
      }
    }

    // 5. Draw Placed Jobs
    layout.placements.forEach((job) => {
      const jx = toPxX(job.x)
      const jy = toPxY(job.y)
      const jw = toPxLen(job.width)
      const jh = toPxLen(job.height)

      const isSelected = selectedJob && selectedJob.pageNumber === job.pageNumber

      // Solid White background for the job card (clears the red waste shading underneath)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(jx, jy, jw, jh)

      // Background fill on top (subtle blue for selected, light grey border for normal)
      ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.05)' : 'rgba(243, 244, 246, 0.5)'
      ctx.fillRect(jx, jy, jw, jh)

      // Outer border
      ctx.strokeStyle = isSelected ? '#2563EB' : '#9CA3AF'
      ctx.lineWidth = isSelected ? 2 : 1
      ctx.strokeRect(jx, jy, jw, jh)

      // Draw inside details
      const fontSize = Math.max(9, toPxLen(6.5))
      ctx.fillStyle = isSelected ? '#1E3A8A' : '#1F2937'
      ctx.font = `600 ${fontSize}px Outfit, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Page number and rotation badge
      const pageText = `Page ${job.pageNumber} ${job.rotation === 90 ? '⟳' : ''}`
      ctx.fillText(pageText, jx + jw / 2, jy + jh / 2 - fontSize * 0.6)

      // Dimensions inside placement
      ctx.fillStyle = '#6B7280'
      ctx.font = `${fontSize * 0.9}px Outfit, sans-serif`
      ctx.fillText(`${Math.round(job.width)} × ${Math.round(job.height)}`, jx + jw / 2, jy + jh / 2 + fontSize * 0.6)
    })

    // 6. Draw Outer Sheet Dimensions Labels
    ctx.fillStyle = '#4B5563'
    ctx.font = '500 11px Outfit, sans-serif'
    ctx.textAlign = 'center'

    // Width label (above top edge)
    ctx.fillText(`${layout.sheetWidth} mm`, startX + sheetPxW / 2, startY - 8)

    // Height label (rotated, left of left edge)
    ctx.save()
    ctx.translate(startX - 12, startY + sheetPxH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(`${layout.sheetHeight} mm`, 0, 0)
    ctx.restore()

  }, [dimensions, layout, zoom, panOffset, selectedJob])

  // Mouse wheel Zoom handler
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomIntensity = 0.1
    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity)
    const nextZoom = Math.min(5.0, Math.max(0.2, zoom * zoomFactor))
    setZoom(nextZoom)
  }

  // Pan / Click handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || isSpacePressed) {
      // Panning active
      setIsPanning(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
    } else if (e.button === 0) {
      // Normal click: Detect job selection
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      // Map canvas click back to layout coordinates in mm
      const baseScaleX = (dimensions.width * 0.75) / layout.sheetWidth
      const baseScaleY = (dimensions.height * 0.75) / layout.sheetHeight
      const baseScale = Math.min(baseScaleX, baseScaleY)
      const scale = baseScale * zoom

      const startX = (dimensions.width - layout.sheetWidth * scale) / 2 + panOffset.x
      const startY = (dimensions.height - layout.sheetHeight * scale) / 2 + panOffset.y

      const clickedMmX = (clickX - startX) / scale
      const clickedMmY = (clickY - startY) / scale

      // Find if any job was clicked
      const foundJob = layout.placements.find((job) => {
        return (
          clickedMmX >= job.x &&
          clickedMmX <= job.x + job.width &&
          clickedMmY >= job.y &&
          clickedMmY <= job.y + job.height
        )
      })

      setSelectedJob(foundJob || null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  return (
    <div className="layout-preview-overlay">
      <div className="layout-preview-window">
        {/* Header HUD panel */}
        <div className="layout-hud-top">
          <div className="hud-title-container">
            <span className="hud-title-text">Imposition Layout Viewer</span>
            <span className="hud-subtitle-text">Interactive Canvas (Scroll to zoom, Drag to pan)</span>
          </div>
          <div className="hud-badge-row">
            <div className="hud-badge">
              <span className="badge-label">Template:</span>
              <span className="badge-value">{layout.templateType.toUpperCase()} ({layout.openingDirection.toUpperCase()})</span>
            </div>
            <div className="hud-badge">
              <span className="badge-label">Binding Side:</span>
              <span className="badge-value">{layout.bindingSide?.toUpperCase() || 'NONE'}</span>
            </div>
            <div className="hud-badge">
              <span className="badge-label">Compatible:</span>
              <span className={`badge-value ${layout.ups > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {layout.ups > 0 ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
          <button className="layout-close-btn" onClick={onClose} title="Close layout viewer">
            ✕
          </button>
        </div>

        {/* Workspace container */}
        <div className="layout-workspace" ref={containerRef}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', cursor: isSpacePressed ? 'grab' : 'default' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Absolute HUD side panel */}
          <div className="layout-hud-sidebar">
            <div className="sidebar-group">
              <h4 className="sidebar-group-title">Sheet Specification</h4>
              <div className="sidebar-field">
                <span className="field-label">Original Sheet</span>
                <span className="field-val">{layout.originalSheetName}</span>
              </div>
              {layout.recommendedSheetName && (
                <div className="sidebar-field highlight-green">
                  <span className="field-label">Recommended Sheet</span>
                  <span className="field-val">{layout.recommendedSheetName}</span>
                </div>
              )}
              {layout.changeReason && (
                <div className="sidebar-field-alert">
                  <span className="field-alert-label">Reason for Recommendation</span>
                  <p className="field-alert-text">{layout.changeReason}</p>
                </div>
              )}
            </div>

            <div className="sidebar-group">
              <h4 className="sidebar-group-title">Layout Metrics</h4>
              <div className="sidebar-field">
                <span className="field-label">UPS (Total)</span>
                <span className="field-val">{layout.ups}</span>
              </div>
              <div className="sidebar-field">
                <span className="field-label">Grid Layout</span>
                <span className="field-val">{layout.jobsAcross} across × {layout.rows} rows</span>
              </div>
              <div className="sidebar-field highlight-red">
                <span className="field-label">Waste Area</span>
                <span className="field-val">
                  {(layout.wasteArea / 100).toFixed(2)} cm² ({((layout.wasteArea / (layout.sheetWidth * layout.sheetHeight)) * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="sidebar-field">
                <span className="field-label">Zoom Factor</span>
                <span className="field-val">{Math.round(zoom * 100)}%</span>
              </div>
            </div>

            {/* Selected placement detail */}
            <div className="sidebar-group">
              <h4 className="sidebar-group-title">Selection Info</h4>
              {selectedJob ? (
                <>
                  <div className="sidebar-field">
                    <span className="field-label">Selected Page</span>
                    <span className="field-val font-semibold text-blue-600">Page {selectedJob.pageNumber}</span>
                  </div>
                  <div className="sidebar-field">
                    <span className="field-label">Dimensions</span>
                    <span className="field-val">{Math.round(selectedJob.width)} × {Math.round(selectedJob.height)} mm</span>
                  </div>
                  <div className="sidebar-field">
                    <span className="field-label">Offset Position</span>
                    <span className="field-val">X: {Math.round(selectedJob.x)}mm | Y: {Math.round(selectedJob.y)}mm</span>
                  </div>
                  <div className="sidebar-field">
                    <span className="field-label">Rotation Angle</span>
                    <span className="field-val">{selectedJob.rotation}°</span>
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-xs italic text-center py-4">Click a page on the canvas to inspect its imposition metrics.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
