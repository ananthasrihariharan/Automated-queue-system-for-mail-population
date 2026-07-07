import { calculateUps, type UpsCalcResult, type CutType } from './upsCalculator';

export interface Sheet {
  name: string;
  width: number;
  height: number;
}

export interface Job {
  width: number;
  height: number;
  qty: number;
  cutType: CutType;
  cutGap: number;
  printableMargin: number;
}

export interface ProductRequest {
  productType: string;
  templateType?: string; // from the configured product template key (e.g. 'booklet', 'none')
  binding?: string;
  openingDirection?: string;
  bindingSide?: string;
  bindingMargin?: number;
}

export interface PrintableArea {
  width: number;
  height: number;
}

export interface ProductTemplate {
  templateType: string;
  binding?: string;
  openingDirection?: string;
  bindingSide?: string;
  bindingMargin?: number;
  minWidth?: number;
  minHeight?: number;
}

/** Strategy Pattern interface for validation rules */
export interface ValidationStrategy {
  validateTemplate(sheet: Sheet, template: ProductTemplate): boolean;
  validatePrintableArea(printableArea: PrintableArea, job: Job, template: ProductTemplate): boolean;
  validateUps(upsResult: UpsCalcResult, template: ProductTemplate): boolean;
}

/** Concrete strategy for Booklet */
export class BookletValidationStrategy implements ValidationStrategy {
  validateTemplate(_sheet: Sheet, _template: ProductTemplate): boolean {
    // Extensible for future rules (e.g. opening direction vs aspect ratio)
    return true;
  }

  validatePrintableArea(printableArea: PrintableArea, job: Job, _template: ProductTemplate): boolean {
    // 1. Check if printable width or height is insufficient to hold at least one job in either orientation
    const fitsOriginal = printableArea.width >= job.width && printableArea.height >= job.height;
    const fitsRotated = printableArea.width >= job.height && printableArea.height >= job.width;
    if (!fitsOriginal && !fitsRotated) {
      return false;
    }

    // 2. Custom template min dimensions if configured
    if (_template.minWidth && printableArea.width < _template.minWidth) return false;
    if (_template.minHeight && printableArea.height < _template.minHeight) return false;

    // 3. Aspect ratio validation against openingDirection
    const openingDirection = (_template.openingDirection || '').toLowerCase().trim();
    if (openingDirection === 'landscape') {
      if (job.width < job.height) {
        return false;
      }
    } else if (openingDirection === 'portrait') {
      if (job.width > job.height) {
        return false;
      }
    }

    return true;
  }

  validateUps(upsResult: UpsCalcResult, _template: ProductTemplate): boolean {
    // Booklet rules:
    // - UPS must be even
    // - UPS cannot be odd
    // - Minimum UPS must be >= 2 (0 is technically even, but not a valid booklet imposition)
    if (upsResult.ups < 2 || upsResult.ups % 2 !== 0) {
      return false;
    }
    return true;
  }
}

/** Default strategy for other products */
export class DefaultValidationStrategy implements ValidationStrategy {
  validateTemplate(_sheet: Sheet, _template: ProductTemplate): boolean {
    return true;
  }

  validatePrintableArea(printableArea: PrintableArea, job: Job, _template: ProductTemplate): boolean {
    // Generic check to make sure the job fits in at least one orientation
    const fitsOriginal = printableArea.width >= job.width && printableArea.height >= job.height;
    const fitsRotated = printableArea.width >= job.height && printableArea.height >= job.width;
    return fitsOriginal || fitsRotated;
  }

  validateUps(upsResult: UpsCalcResult, _template: ProductTemplate): boolean {
    return upsResult.ups > 0;
  }
}

/** Factory Pattern for Validation Strategy lookup */
export class ValidationStrategyFactory {
  private static strategies: Record<string, ValidationStrategy> = {
    booklet: new BookletValidationStrategy(),
    default: new DefaultValidationStrategy(),
  };

  static getStrategy(templateType: string): ValidationStrategy {
    const key = (templateType || '').toLowerCase().trim();
    return this.strategies[key] || this.strategies.default;
  }

  // Open-Closed Principle: Allow registering new strategies dynamically in the future
  static registerStrategy(templateType: string, strategy: ValidationStrategy) {
    this.strategies[templateType.toLowerCase().trim()] = strategy;
  }
}

/** Template Engine responsible for creating Product Templates */
export class TemplateEngine {
  static load(request: ProductRequest): ProductTemplate {
    return {
      templateType: request.templateType || 'none',
      binding: request.binding,
      openingDirection: request.openingDirection,
      bindingSide: request.bindingSide,
      bindingMargin: request.bindingMargin,
      // Extensible: load custom rules or dimensions from database configuration in the future
    };
  }
}

/** Sheet Search Engine responsible for sheet ordering and iteration */
export class SheetSearchEngine {
  /** Business priority: smaller sheets cost less, so order ascending by sheet area */
  static sortSheetsByPriority(sheets: Sheet[]): Sheet[] {
    return [...sheets].sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (areaA !== areaB) {
        return areaA - areaB;
      }
      // Tie breaker: sheet name alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  static next(currentSheet: Sheet, sortedSheets: Sheet[]): Sheet | null {
    const currentIndex = sortedSheets.findIndex(
      s => s.name === currentSheet.name && s.width === currentSheet.width && s.height === currentSheet.height
    );
    if (currentIndex === -1 || currentIndex >= sortedSheets.length - 1) {
      return null;
    }
    return sortedSheets[currentIndex + 1];
  }
}

/** Compatibility Engine Orchestrator */
export class CompatibilityEngine {
  static validate(
    selectedSheet: Sheet,
    allSheets: Sheet[],
    job: Job,
    request: ProductRequest
  ): { compatibleSheet: Sheet; upsResult: UpsCalcResult } | null {
    // 1. Sort sheets using business priority (area ascending)
    const sortedSheets = SheetSearchEngine.sortSheetsByPriority(allSheets);

    // 2. Locate starting index (the selected sheet)
    const selectedIndex = sortedSheets.findIndex(
      s => s.name === selectedSheet.name && s.width === selectedSheet.width && s.height === selectedSheet.height
    );

    // If selected sheet is not in the board sheets list, start with the selectedSheet itself
    let sheet: Sheet | null = selectedIndex !== -1 ? sortedSheets[selectedIndex] : selectedSheet;

    // 3. Load Template
    const template = TemplateEngine.load(request);
    const strategy = ValidationStrategyFactory.getStrategy(template.templateType);

    while (sheet !== null) {
      // Step 2: Calculate Printable Area
      const printableArea: PrintableArea = {
        width: Math.max(0, sheet.width - 2 * job.printableMargin),
        height: Math.max(0, sheet.height - 2 * job.printableMargin),
      };

      // Step 3: Validate Template
      if (!strategy.validateTemplate(sheet, template)) {
        sheet = SheetSearchEngine.next(sheet, sortedSheets);
        continue;
      }

      // Step 4: Validate Printable Area
      if (!strategy.validatePrintableArea(printableArea, job, template)) {
        sheet = SheetSearchEngine.next(sheet, sortedSheets);
        continue;
      }

      // Step 5: Calculate UPS (UPS Engine)
      let jobW = job.width;
      let jobH = job.height;
      if (template.templateType === 'booklet') {
        const side = (template.bindingSide || '').toLowerCase().trim();
        const margin = template.bindingMargin || 0;
        if (side === 'left' || side === 'right') {
          jobW = job.width + margin;
        } else if (side === 'top' || side === 'bottom') {
          jobH = job.height + margin;
        }
      }

      const upsResult = calculateUps({
        sheetWidth: sheet.width,
        sheetHeight: sheet.height,
        jobWidth: jobW,
        jobHeight: jobH,
        quantity: job.qty,
        cutType: job.cutType,
        cutGap: job.cutGap,
        printableMargin: job.printableMargin,
        bookletSide: template.templateType === 'booklet' ? template.bindingSide : undefined,
      });

      // Step 6: Validate UPS
      if (!strategy.validateUps(upsResult, template)) {
        sheet = SheetSearchEngine.next(sheet, sortedSheets);
        continue;
      }

      // Step 7: Return Result (Compatible sheet and the layout results)
      return {
        compatibleSheet: sheet,
        upsResult,
      };
    }

    return null; // No compatible sheet found
  }
}
