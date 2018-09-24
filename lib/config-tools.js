const _ = require('the-lodash');

exports._sortedConfigArray = function(configArray)
{
    return _.sortBy(configArray, x => JSON.stringify(x));
}

exports.areSame = function(newConfig, currentConfig)
{
    if (_.isBoolean(newConfig) || _.isNumber(newConfig) || _.isString(newConfig)) {
        if (newConfig != currentConfig) {
            console.log('NOT SAME. NEW: ' + newConfig + ', OLD: ' + currentConfig);
            return false;
        }
    }
    else if (_.isArray(newConfig)) {
        if (newConfig.length !== currentConfig.length) {
            return false;
        }
        var newConfigArray = exports._sortedConfigArray(newConfig);
        var currentConfigArray = exports._sortedConfigArray(currentConfig);

        for(var i = 0; i < newConfigArray.length; i++) {
            if (!exports.areSame(newConfigArray[i], currentConfigArray[i])) {
                console.log('NOT SAME. NEW: ' + newConfigArray[i] + ', OLD: ' + currentConfigArray[i]);
                return false;
            }
        }
    }
    else if (_.isObject(newConfig)) {
        for(var key of _.keys(newConfig)) {
            if (!(key in currentConfig)) {
                console.log('MISSING KEY: ' + key);
                return false;
            }
            var newVal = newConfig[key];
            var oldVal = currentConfig[key];
            if (!exports.areSame(newVal, oldVal)) {
                console.log('NOT SAME. NEW: ' + newVal + ', OLD: ' + oldVal);
                return false;
            }
        }
    }
    else {
        throw new Error("UNCLASSIFIED: " + newConfig);
    }
    return true;
}
