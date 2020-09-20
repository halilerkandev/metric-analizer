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
declare type PostFunc = (url: any, data: any) => Promise<any>;
export default class PerformanceMetrics {
    private postFunc;
    private url;
    private isUnloading;
    private listenersAdded;
    private firstHiddenTime;
    constructor(postFunc: PostFunc, url: string);
    private postData;
    private bindReporter;
    private onPageHide;
    private addListeners;
    private onHidden;
    private getFirstHidden;
    getTTFB: (onReport: ReportHandler) => void;
    getFCP(onReport: ReportHandler): void;
    getDL(onReport: ReportHandler): void;
    getWL(onReport: ReportHandler): void;
    getNT(onReport: ReportHandler): void;
}
export {};
