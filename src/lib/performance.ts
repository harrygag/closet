/**
 * Performance monitoring utilities
 * Tracks and reports performance metrics for the application
 */

export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map()
  private static marks: Map<string, number> = new Map()

  /**
   * Start measuring performance for an operation
   * Returns a function to end the measurement
   */
  static startMeasure(name: string): () => void {
    const start = performance.now()
    this.marks.set(name, start)

    return () => {
      const duration = performance.now() - start
      const existing = this.metrics.get(name) || []
      this.metrics.set(name, [...existing, duration])

      if (import.meta.env.DEV) {
        console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`)
      }

      this.marks.delete(name)
    }
  }

  /**
   * Measure an async operation
   */
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const end = this.startMeasure(name)
    try {
      const result = await fn()
      return result
    } finally {
      end()
    }
  }

  /**
   * Measure a sync operation
   */
  static measure<T>(name: string, fn: () => T): T {
    const end = this.startMeasure(name)
    try {
      return fn()
    } finally {
      end()
    }
  }

  /**
   * Get statistics for a specific measurement
   */
  static getStats(name: string) {
    const measurements = this.metrics.get(name) || []
    if (measurements.length === 0) return null

    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length
    const max = Math.max(...measurements)
    const min = Math.min(...measurements)
    const p95 = this.percentile(measurements, 95)
    const p99 = this.percentile(measurements, 99)

    return { avg, max, min, p95, p99, count: measurements.length }
  }

  /**
   * Calculate percentile for a set of measurements
   */
  private static percentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index]
  }

  /**
   * Get all performance metrics
   */
  static reportAll(): Record<string, ReturnType<typeof this.getStats>> {
    const report: Record<string, ReturnType<typeof this.getStats>> = {}
    this.metrics.forEach((_, name) => {
      report[name] = this.getStats(name)
    })
    return report
  }

  /**
   * Clear all metrics
   */
  static clear(): void {
    this.metrics.clear()
    this.marks.clear()
  }

  /**
   * Clear metrics for a specific measurement
   */
  static clearMetric(name: string): void {
    this.metrics.delete(name)
    this.marks.delete(name)
  }

  /**
   * Log a performance summary to console
   */
  static logSummary(): void {
    const report = this.reportAll()
    console.table(report)
  }

  /**
   * Track Core Web Vitals
   */
  static trackWebVitals(): void {
    if (typeof window === 'undefined') return

    // First Contentful Paint
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          console.log('[WEB VITALS] FCP:', entry.startTime.toFixed(2), 'ms')
        }
      }
    })
    paintObserver.observe({ entryTypes: ['paint'] })

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      console.log('[WEB VITALS] LCP:', lastEntry.startTime.toFixed(2), 'ms')
    })
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })

    // Cumulative Layout Shift
    let clsValue = 0
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value
        }
      }
      console.log('[WEB VITALS] CLS:', clsValue.toFixed(4))
    })
    clsObserver.observe({ entryTypes: ['layout-shift'] })

    // First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fid = (entry as any).processingStart - entry.startTime
        console.log('[WEB VITALS] FID:', fid.toFixed(2), 'ms')
      }
    })
    fidObserver.observe({ entryTypes: ['first-input'] })
  }
}

/**
 * Error tracking utility
 * Captures and logs errors for monitoring
 */
export class ErrorTracker {
  private static errors: Array<{
    error: Error
    context?: Record<string, any>
    timestamp: number
  }> = []

  /**
   * Capture an error with optional context
   */
  static capture(error: Error, context?: Record<string, any>): void {
    const errorEntry = {
      error,
      context,
      timestamp: Date.now(),
    }

    this.errors.push(errorEntry)

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ERROR]', error, context)
    }

    // In production, send to monitoring service
    if (import.meta.env.PROD) {
      this.sendToMonitoring(errorEntry)
    }
  }

  /**
   * Send error to monitoring service (placeholder for future integration)
   */
  private static sendToMonitoring(errorEntry: {
    error: Error
    context?: Record<string, any>
    timestamp: number
  }): void {
    // TODO: Integrate with Sentry or similar service
    // For now, just log to console
    console.error('[PRODUCTION ERROR]', {
      message: errorEntry.error.message,
      stack: errorEntry.error.stack,
      context: errorEntry.context,
      timestamp: new Date(errorEntry.timestamp).toISOString(),
    })
  }

  /**
   * Get all captured errors
   */
  static getErrors() {
    return [...this.errors]
  }

  /**
   * Clear all errors
   */
  static clear(): void {
    this.errors = []
  }

  /**
   * Set up global error handlers
   */
  static setupGlobalHandlers(): void {
    if (typeof window === 'undefined') return

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.capture(new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    })

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.capture(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
        {
          type: 'unhandledRejection',
        }
      )
    })
  }
}

/**
 * Hook for measuring component render performance
 */
export function usePerformanceMonitor(componentName: string) {
  if (import.meta.env.DEV) {
    const end = PerformanceMonitor.startMeasure(`render:${componentName}`)
    return end
  }
  return () => {}
}
