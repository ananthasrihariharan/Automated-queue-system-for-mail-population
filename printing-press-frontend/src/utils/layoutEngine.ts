import type { Sheet, Job, ProductRequest } from './compatibilityEngine';
import type { UpsCalcResult } from './upsCalculator';

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  pageNumber: number;
}

export interface LayoutResult {
  sheetWidth: number;
  sheetHeight: number;
  printableWidth: number;
  printableHeight: number;
  margin: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  ups: number;
  placements: Placement[];
  wasteArea: number;
  openingDirection: string;
  templateType: string;
  jobsAcross: number;
  rows: number;
  originalSheetName: string;
  recommendedSheetName?: string;
  changeReason?: string;
  bindingSide?: string;
}

export class LayoutEngine {
  static generate(
    originalSheet: Sheet,
    compatibleSheet: Sheet,
    job: Job,
    request: ProductRequest,
    upsResult: UpsCalcResult
  ): LayoutResult {
    const isRotated = upsResult.orientation === 'rotated';
    const margin = job.printableMargin;
    const gap = job.cutType === 'none' ? 0 : job.cutGap;
    
    const bindingSide = (request.bindingSide || 'left').toLowerCase().trim();
    const bindingMargin = request.bindingMargin || 0;
    
    let jobW = job.width;
    let jobH = job.height;
    if (request.templateType === 'booklet') {
      if (bindingSide === 'left' || bindingSide === 'right') {
        jobW = job.width + bindingMargin;
      } else if (bindingSide === 'top' || bindingSide === 'bottom') {
        jobH = job.height + bindingMargin;
      }
    }

    const startX = margin + upsResult.leftMargin;
    const startY = margin + upsResult.topMargin;
    
    const placements: Placement[] = [];
    let pageNumber = 1;

    for (let row = 0; row < upsResult.rows; row++) {
      for (let col = 0; col < upsResult.jobsAcross; col++) {
        if (isRotated) {
          // Rotated orientation
          const x = startX + col * (jobH + gap);
          const y = startY + row * (jobW + gap);
          placements.push({
            x,
            y,
            width: job.height, // page width is original height when rotated
            height: job.width,  // page height is original width when rotated
            rotation: 90,
            pageNumber: pageNumber++
          });
        } else {
          // Original orientation
          const x = startX + col * (jobW + gap);
          const y = startY + row * (jobH + gap);
          placements.push({
            x,
            y,
            width: job.width,
            height: job.height,
            rotation: 0,
            pageNumber: pageNumber++
          });
        }
      }
    }

    const sheetArea = compatibleSheet.width * compatibleSheet.height;
    const jobArea = upsResult.ups * job.width * job.height;
    const wasteArea = Math.max(0, sheetArea - jobArea);

    const sheetChanged = originalSheet.name !== compatibleSheet.name;

    const isPortraitSheet = compatibleSheet.height > compatibleSheet.width;

    let finalSheetW = compatibleSheet.width;
    let finalSheetH = compatibleSheet.height;
    let finalPrintableW = compatibleSheet.width - 2 * margin;
    let finalPrintableH = compatibleSheet.height - 2 * margin;
    let finalJobsAcross = upsResult.jobsAcross;
    let finalRows = upsResult.rows;
    let finalPlacements = placements;

    if (isPortraitSheet) {
      finalSheetW = compatibleSheet.height;
      finalSheetH = compatibleSheet.width;
      finalPrintableW = compatibleSheet.height - 2 * margin;
      finalPrintableH = compatibleSheet.width - 2 * margin;
      finalJobsAcross = upsResult.rows;
      finalRows = upsResult.jobsAcross;

      finalPlacements = placements.map(p => {
        return {
          x: p.y,
          y: compatibleSheet.width - p.x - p.width,
          width: p.height,
          height: p.width,
          rotation: p.rotation === 0 ? 90 : 0,
          pageNumber: p.pageNumber
        };
      });
    }

    return {
      sheetWidth: finalSheetW,
      sheetHeight: finalSheetH,
      printableWidth: finalPrintableW,
      printableHeight: finalPrintableH,
      margin: {
        left: margin,
        right: margin,
        top: margin,
        bottom: margin
      },
      ups: upsResult.ups,
      placements: finalPlacements,
      wasteArea,
      openingDirection: request.openingDirection || 'none',
      templateType: request.templateType || 'none',
      jobsAcross: finalJobsAcross,
      rows: finalRows,
      originalSheetName: originalSheet.name,
      recommendedSheetName: sheetChanged ? compatibleSheet.name : undefined,
      changeReason: sheetChanged ? 'Template compatibility constraints' : undefined,
      bindingSide: request.bindingSide
    };
  }
}
