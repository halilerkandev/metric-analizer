interface Metric {
  name: 'FCP' | 'TTFB' | 'DL' | 'WL' | 'NT';
  value: number;
  delta: number;
  metricId: string;
  isFinal: boolean;
  entry: PerformanceEntry | undefined;
}

interface ReportHandler {
  (metric: Metric): void;
}

interface NavigationEntryShim {
  entryType: string;
  startTime: number;
  connectEnd?: number;
  connectStart?: number;
  domComplete?: number;
  domContentLoadedEventEnd?: number;
  domContentLoadedEventStart?: number;
  domInteractive?: number;
  domainLookupEnd?: number;
  domainLookupStart?: number;
  fetchStart?: number;
  loadEventEnd?: number;
  loadEventStart?: number;
  redirectEnd?: number;
  redirectStart?: number;
  requestStart?: number;
  responseEnd?: number;
  responseStart?: number;
  secureConnectionStart?: number;
  unloadEventEnd?: number;
  unloadEventStart?: number;
}

type PerformanceTimingKeys =
  | 'connectEnd'
  | 'connectStart'
  | 'domComplete'
  | 'domContentLoadedEventEnd'
  | 'domContentLoadedEventStart'
  | 'domInteractive'
  | 'domainLookupEnd'
  | 'domainLookupStart'
  | 'fetchStart'
  | 'loadEventEnd'
  | 'loadEventStart'
  | 'redirectEnd'
  | 'redirectStart'
  | 'requestStart'
  | 'responseEnd'
  | 'responseStart'
  | 'secureConnectionStart'
  | 'unloadEventEnd'
  | 'unloadEventStart';

interface OnHiddenCallback {
  ({
    timeStamp,
    isUnloading,
  }: {
    timeStamp: number;
    isUnloading: boolean;
  }): void;
}

interface PerformanceEntryHandler {
  (entry: PerformanceEntry): void;
}

type PostFunc = (url: any, data: any) => Promise<any>;

function generateUniqueID() {
  return `${Date.now()}-${Math.floor(Math.random() * (9e12 - 1)) + 1e12}`;
}

function initMetric(name: Metric['name'], value = -1): Metric {
  return {
    name,
    value,
    delta: 0,
    metricId: generateUniqueID(),
    isFinal: false,
    entry: undefined,
  };
}

function afterLoad(callback: () => void) {
  if (document.readyState === 'complete') {
    setTimeout(callback, 0);
  } else {
    addEventListener('pageshow', callback);
  }
}

function getNavigationEntryFromPerformanceTiming() {
  const timing = performance.timing;

  const navigationEntry: NavigationEntryShim = {
    entryType: 'navigation',
    startTime: 0,
  };

  for (const key in timing) {
    if (key !== 'navigationStart' && key !== 'toJSON') {
      navigationEntry[key as PerformanceTimingKeys] = Math.max(
        timing[key as PerformanceTimingKeys] - timing.navigationStart,
        0
      );
    }
  }

  return navigationEntry as PerformanceNavigationTiming;
}

function observe(
  type: string,
  callback: PerformanceEntryHandler
): PerformanceObserver | undefined {
  try {
    if (PerformanceObserver.supportedEntryTypes.includes(type)) {
      const po: PerformanceObserver = new PerformanceObserver((l) =>
        l.getEntries().map(callback)
      );

      po.observe({ type, buffered: true });
      return po;
    }
  } catch (e) {}
  return;
}

export default class PerformanceMetrics {
  private isUnloading: boolean = false;
  private listenersAdded: boolean = false;
  private firstHiddenTime: number | undefined = undefined;

  constructor(private postFunc: PostFunc, private url: string) {}

  private postData(url: any, data: any) {
    try {
      this.postFunc(url, data);
    } catch (error) {
      console.error(error);
    }
  }

  private bindReporter = (
    callback: ReportHandler,
    metric: Metric,
    po: PerformanceObserver | undefined,
    observeAllUpdates?: boolean
  ) => {
    let prevValue: number;
    return () => {
      if (po && metric.isFinal) {
        po.disconnect();
      }
      if (metric.value >= 0) {
        if (
          observeAllUpdates ||
          metric.isFinal ||
          document.visibilityState === 'hidden'
        ) {
          metric.delta = metric.value - (prevValue || 0);

          if (metric.delta || metric.isFinal || prevValue === undefined) {
            this.postData(this.url, metric);
            if (callback) {
              callback(metric);
            }
            prevValue = metric.value;
          }
        }
      }
    };
  };

  private onPageHide = (event: PageTransitionEvent) => {
    this.isUnloading = !event.persisted;
  };

  private addListeners = () => {
    addEventListener('pagehide', this.onPageHide);
    addEventListener('beforeunload', () => {});
  };

  private onHidden(cb: OnHiddenCallback, once = false) {
    const isUnloading = this.isUnloading;

    if (!this.listenersAdded) {
      this.addListeners();
      this.listenersAdded = true;
    }

    addEventListener(
      'visibilitychange',
      ({ timeStamp }) => {
        if (document.visibilityState === 'hidden') {
          cb({ timeStamp, isUnloading });
        }
      },
      { capture: true, once }
    );
  }

  private getFirstHidden = () => {
    if (this.firstHiddenTime === undefined) {
      this.firstHiddenTime =
        document.visibilityState === 'hidden' ? 0 : Infinity;
      this.onHidden(
        ({ timeStamp }) => (this.firstHiddenTime = timeStamp),
        true
      );
    }

    const firstHiddenTime = this.firstHiddenTime;

    return {
      get timeStamp() {
        return firstHiddenTime;
      },
    };
  };

  public getTTFB = (onReport: ReportHandler) => {
    const metric = initMetric('TTFB');

    afterLoad(() => {
      try {
        const navigationEntry =
          performance.getEntriesByType('navigation')[0] ||
          getNavigationEntryFromPerformanceTiming();

        metric.value = metric.delta = (navigationEntry as PerformanceNavigationTiming).responseStart;
        metric.entry = navigationEntry;
        metric.isFinal = true;

        this.postData(this.url, metric);

        if (onReport) {
          onReport(metric);
        }
      } catch (error) {}
    });
  };

  public getFCP(onReport: ReportHandler) {
    const metric = initMetric('FCP');
    const firstHidden = this.getFirstHidden();
    const bindReporter = this.bindReporter;

    let report: ReturnType<typeof bindReporter>;

    const entryHandler = (entry: PerformanceEntry) => {
      if (entry.name === 'first-contentful-paint') {
        if (entry.startTime < firstHidden.timeStamp) {
          metric.value = entry.startTime;
          metric.isFinal = true;
          metric.entry = entry;
          if (onReport!) {
            report();
          }
        }
      }
    };

    const po = observe('paint', entryHandler);
    if (po) {
      report = bindReporter(onReport, metric, po);
    }
  }

  public getDL(onReport: ReportHandler) {
    const metric = initMetric('DL');

    afterLoad(() => {
      try {
        const navigationEntry = getNavigationEntryFromPerformanceTiming();

        metric.value = metric.delta =
          (navigationEntry as any).domComplete -
          (navigationEntry as any).domLoading;
        metric.entry = navigationEntry;
        metric.isFinal = true;

        this.postData(this.url, metric);

        if (onReport) {
          onReport(metric);
        }
      } catch (error) {}
    });
  }

  public getWL(onReport: ReportHandler) {
    const metric = initMetric('WL');

    afterLoad(() => {
      try {
        const navigationEntry = getNavigationEntryFromPerformanceTiming();

        metric.value = metric.delta =
          (navigationEntry as any).loadEventEnd -
          (navigationEntry as any).loadEventStart;
        metric.entry = navigationEntry;
        metric.isFinal = true;

        this.postData(this.url, metric);

        if (onReport) {
          onReport(metric);
        }
      } catch (error) {}
    });
  }

  public getNT(onReport: ReportHandler) {
    const metric = initMetric('NT');
    const bindReporter = this.bindReporter;

    let report: ReturnType<typeof bindReporter>;

    const entryHandler = (entry: any) => {
      metric.value = entry.responseEnd - entry.requestStart;
      metric.isFinal = true;
      metric.entry = entry;

      report();
    };

    const po = observe('resource', entryHandler);
    if (po) {
      report = bindReporter(onReport, metric, po);
    }
  }
}
