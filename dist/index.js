"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function generateUniqueID() {
    return Date.now() + "-" + (Math.floor(Math.random() * (9e12 - 1)) + 1e12);
}
function initMetric(name, value) {
    if (value === void 0) { value = -1; }
    return {
        name: name,
        value: value,
        delta: 0,
        metricId: generateUniqueID(),
        isFinal: false,
        entry: undefined,
    };
}
function afterLoad(callback) {
    if (document.readyState === 'complete') {
        setTimeout(callback, 0);
    }
    else {
        addEventListener('pageshow', callback);
    }
}
function getNavigationEntryFromPerformanceTiming() {
    var timing = performance.timing;
    var navigationEntry = {
        entryType: 'navigation',
        startTime: 0,
    };
    for (var key in timing) {
        if (key !== 'navigationStart' && key !== 'toJSON') {
            navigationEntry[key] = Math.max(timing[key] - timing.navigationStart, 0);
        }
    }
    return navigationEntry;
}
function observe(type, callback) {
    try {
        if (PerformanceObserver.supportedEntryTypes.includes(type)) {
            var po = new PerformanceObserver(function (l) {
                return l.getEntries().map(callback);
            });
            po.observe({ type: type, buffered: true });
            return po;
        }
    }
    catch (e) { }
    return;
}
var PerformanceMetrics = /** @class */ (function () {
    function PerformanceMetrics(postFunc, url) {
        var _this = this;
        this.postFunc = postFunc;
        this.url = url;
        this.isUnloading = false;
        this.listenersAdded = false;
        this.firstHiddenTime = undefined;
        this.bindReporter = function (callback, metric, po, observeAllUpdates) {
            var prevValue;
            return function () {
                if (po && metric.isFinal) {
                    po.disconnect();
                }
                if (metric.value >= 0) {
                    if (observeAllUpdates ||
                        metric.isFinal ||
                        document.visibilityState === 'hidden') {
                        metric.delta = metric.value - (prevValue || 0);
                        if (metric.delta || metric.isFinal || prevValue === undefined) {
                            _this.postData(_this.url, metric);
                            if (callback) {
                                callback(metric);
                            }
                            prevValue = metric.value;
                        }
                    }
                }
            };
        };
        this.onPageHide = function (event) {
            _this.isUnloading = !event.persisted;
        };
        this.addListeners = function () {
            addEventListener('pagehide', _this.onPageHide);
            addEventListener('beforeunload', function () { });
        };
        this.getFirstHidden = function () {
            if (_this.firstHiddenTime === undefined) {
                _this.firstHiddenTime =
                    document.visibilityState === 'hidden' ? 0 : Infinity;
                _this.onHidden(function (_a) {
                    var timeStamp = _a.timeStamp;
                    return (_this.firstHiddenTime = timeStamp);
                }, true);
            }
            var firstHiddenTime = _this.firstHiddenTime;
            return {
                get timeStamp() {
                    return firstHiddenTime;
                },
            };
        };
        this.getTTFB = function (onReport) {
            var metric = initMetric('TTFB');
            afterLoad(function () {
                try {
                    var navigationEntry = performance.getEntriesByType('navigation')[0] ||
                        getNavigationEntryFromPerformanceTiming();
                    metric.value = metric.delta = navigationEntry.responseStart;
                    metric.entry = navigationEntry;
                    metric.isFinal = true;
                    _this.postData(_this.url, metric);
                    if (onReport) {
                        onReport(metric);
                    }
                }
                catch (error) { }
            });
        };
    }
    PerformanceMetrics.prototype.postData = function (url, data) {
        try {
            this.postFunc(url, data);
        }
        catch (error) {
            console.error(error);
        }
    };
    PerformanceMetrics.prototype.onHidden = function (cb, once) {
        if (once === void 0) { once = false; }
        var isUnloading = this.isUnloading;
        if (!this.listenersAdded) {
            this.addListeners();
            this.listenersAdded = true;
        }
        addEventListener('visibilitychange', function (_a) {
            var timeStamp = _a.timeStamp;
            if (document.visibilityState === 'hidden') {
                cb({ timeStamp: timeStamp, isUnloading: isUnloading });
            }
        }, { capture: true, once: once });
    };
    PerformanceMetrics.prototype.getFCP = function (onReport) {
        var metric = initMetric('FCP');
        var firstHidden = this.getFirstHidden();
        var bindReporter = this.bindReporter;
        var report;
        var entryHandler = function (entry) {
            if (entry.name === 'first-contentful-paint') {
                if (entry.startTime < firstHidden.timeStamp) {
                    metric.value = entry.startTime;
                    metric.isFinal = true;
                    metric.entry = entry;
                    if (onReport) {
                        report();
                    }
                }
            }
        };
        var po = observe('paint', entryHandler);
        if (po) {
            report = bindReporter(onReport, metric, po);
        }
    };
    PerformanceMetrics.prototype.getDL = function (onReport) {
        var _this = this;
        var metric = initMetric('DL');
        afterLoad(function () {
            try {
                var navigationEntry = getNavigationEntryFromPerformanceTiming();
                metric.value = metric.delta =
                    navigationEntry.domComplete -
                        navigationEntry.domLoading;
                metric.entry = navigationEntry;
                metric.isFinal = true;
                _this.postData(_this.url, metric);
                if (onReport) {
                    onReport(metric);
                }
            }
            catch (error) { }
        });
    };
    PerformanceMetrics.prototype.getWL = function (onReport) {
        var _this = this;
        var metric = initMetric('WL');
        afterLoad(function () {
            try {
                var navigationEntry = getNavigationEntryFromPerformanceTiming();
                metric.value = metric.delta =
                    navigationEntry.loadEventEnd -
                        navigationEntry.loadEventStart;
                metric.entry = navigationEntry;
                metric.isFinal = true;
                _this.postData(_this.url, metric);
                if (onReport) {
                    onReport(metric);
                }
            }
            catch (error) { }
        });
    };
    PerformanceMetrics.prototype.getNT = function (onReport) {
        var metric = initMetric('NT');
        var bindReporter = this.bindReporter;
        var report;
        var entryHandler = function (entry) {
            metric.value = entry.responseEnd - entry.requestStart;
            metric.isFinal = true;
            metric.entry = entry;
            report();
        };
        var po = observe('resource', entryHandler);
        if (po) {
            report = bindReporter(onReport, metric, po);
        }
    };
    return PerformanceMetrics;
}());
exports.default = PerformanceMetrics;
