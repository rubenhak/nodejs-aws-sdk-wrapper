const _ = require('the-lodash');
const AWS = require('aws-sdk');
const RateThrottler = require('processing-tools/rateThrottler');
const ConcurrentThrottler = require('processing-tools/concurrentThrottler');
const Promise = require('the-promise');

class AWSClient
{
    constructor(logger, region, credentials)
    {
        this._logger = logger;
        this._region = region;

        if (!credentials) {
            credentials = {};
        }
        this._credentials = credentials;
        this._credentialsEnv = {};

        this._myServices = {};
        this._awsServices = {};

        this._serviceConfig = {
            region: this._region
        }

        this._throttlerConfig = {
            default: {
                shouldWrap: true,
                interval: 1000,
                number: 10,
            },
            byService: {
                'ec2': {
                    config: {
                        interval: 1000,
                        number: 20
                    }
                },
                'route53': {
                    config: {
                        interval: 1000,
                        number: 5
                    }
                },
                'elbv2': {
                    config: {
                        interval: 1000,
                        number: 5
                    }
                },
                'kinesis': {
                    config: {
                        interval: 1000,
                        number: 5
                    }
                },
                'dynamodb':  {
                    config: {
                        actions: {
                            'createTable': {
                                tag: 'modif',
                                concurrent: true,
                                number: 5
                            },
                            'updateTable': {
                                tag: 'modif',
                                concurrent: true,
                                number: 5
                            },
                            'deleteTable': {
                                tag: 'modif',
                                concurrent: true,
                                number: 5
                            }
                        }
                    }
                },
                'kms': {
                    config: {
                        interval: 1000,
                        number: 5
                    }
                },
                'lambda': {
                    actions: {
                        'createFunction': {
                            tag: 'modif',
                            interval: 1000,
                            number: 1
                        },
                        'deleteFunction': {
                            tag: 'modif',
                            interval: 1000,
                            number: 1
                        },
                        'updateFunctionCode': {
                            tag: 'modif',
                            interval: 1000,
                            number: 1
                        },
                        'updateFunctionConfiguration': {
                            tag: 'modif',
                            interval: 1000,
                            number: 1
                        }
                    }
                },
                'apigateway': {
                    actions: {
                        'createResource': {
                            tag: 'setup',
                            interval: 1000,
                            number: 1
                        },
                        'deleteResource': {
                            tag: 'setup',
                            interval: 1000,
                            number: 1
                        },
                        'putMethod': {
                            tag: 'setup',
                            interval: 1000,
                            number: 1
                        },
                        'deleteMethod': {
                            tag: 'setup',
                            interval: 1000,
                            number: 1
                        },
                        'updateMethod': {
                            tag: 'setup',
                            interval: 1000,
                            number: 1
                        }
                    }
                },
                's3': {
                    actions: {
                        'upload': {
                            concurrent: true,
                            number: 5
                        }
                    }
                }
            }
        };

        this._processCredentials();
        this._logger.info('AWS SERVICE CONFIG: ', this._serviceConfig);
    }

    get logger() {
        return this._logger;
    }

    get region() {
        return this._region;
    }

    _processCredentials()
    {
        if (this._credentials.profile) {
            this._credentialsEnv.AWS_PROFILE = this._credentials.profile;
            this._serviceConfig.credentials = new AWS.SharedIniFileCredentials({
                profile: this._credentials.profile
            });
        }
        else if (this._credentials.key)
        {
            this._credentialsEnv.AWS_ACCESS_KEY_ID = this._credentials.key;
            this._credentialsEnv.AWS_SECRET_ACCESS_KEY = this._credentials.secret;
            this._serviceConfig.credentials = new AWS.Credentials({
                accessKeyId: this._credentials.key,
                secretAccessKey: this._credentials.secret
            });
        }
        else if (process.env.BERLIOZ_INFRA == 'aws') {
            this._serviceConfig.credentials = new AWS.ECSCredentials();
        }
        else if (process.env.AWS_PROFILE) {
            this._credentialsEnv.AWS_PROFILE = process.env.AWS_PROFILE;
            this._serviceConfig.credentials = new AWS.SharedIniFileCredentials({
                profile: process.env.AWS_PROFILE
            });
        }
        else
        {
            this._serviceConfig.credentials = new AWS.EnvironmentCredentials('AWS');
        }
    }

    /***** MY SERVICES BEGIN ******/
    get Ec2utils() {
        return this._getMyService('./ec2-utils');
    }

    get Vpc() {
        return this._getMyService('./services/vpc');
    }

    get RouteTable() {
        return this._getMyService('./services/route-table');
    }

    get Subnet() {
        return this._getMyService('./services/subnet');
    }

    get SecurityGroup() {
        return this._getMyService('./services/security-group');
    }

    get LaunchConfiguration() {
        return this._getMyService('./services/launch-configuration');
    }

    get AutoScalingGroup() {
        return this._getMyService('./services/auto-scaling-group');
    }

    get Cluster() {
        return this._getMyService('./services/cluster');
    }

    get InternetGateway() {
        return this._getMyService('./services/internet-gateway');
    }

    get Repository() {
        return this._getMyService('./services/repository');
    }

    get TaskDefinition() {
        return this._getMyService('./services/task-definition');
    }

    get CloudWatch() {
        return this._getMyService('./services/cloud-watch');
    }

    get ContainerInstance() {
        return this._getMyService('./services/container-instance');
    }

    get Task() {
        return this._getMyService('./services/task');
    }

    get HostedZone() {
        return this._getMyService('./services/hosted-zone');
    }

    get Instance() {
        return this._getMyService('./services/instance');
    }

    get Security() {
        return this._getMyService('./services/security');
    }

    get Volume() {
        return this._getMyService('./services/volume');
    }

    get NetworkInterface() {
        return this._getMyService('./services/network-interface');
    }

    get LoadBalancing() {
        return this._getMyService('./services/load-balancing');
    }

    get Policy() {
        return this._getMyService('./services/policy');
    }

    get Role() {
        return this._getMyService('./services/role');
    }

    get InstanceProfile() {
        return this._getMyService('./services/instance-profile');
    }

    get MessageQueue() {
        return this._getMyService('./services/message-queue');
    }

    get Lambda() {
        return this._getMyService('./services/lambda');
    }

    get EventRule() {
        return this._getMyService('./services/event-rule');
    }

    get S3() {
        return this._getMyService('./services/s3');
    }

    get Dynamo() {
        return this._getMyService('./services/dynamo');
    }

    get Kinesis() {
        return this._getMyService('./services/kinesis');
    }

    get SystemsManager() {
        return this._getMyService('./services/systems-manager');
    }

    get KeyManagement() {
        return this._getMyService('./services/key-management');
    }

    get ApiGateway() {
        return this._getMyService('./services/api-gateway');
    }

    get Cognito() {
        return this._getMyService('./services/cognito');
    }

    get User() {
        return this._getMyService('./services/user');
    }

    get ApiGatewayHelper() {
        var Helper = require('./api-gateway');
        return new Helper(this._logger.sublogger('ApiGatewayHelper'), this.ApiGateway);
    }

    get CognitoHelper() {
        var Helper = require('./cognito');
        return new Helper(this._logger.sublogger('CognitoHelper'), this.Cognito);
    }

    get DynamoDB() {
        var dynamoDb = this.getRawAwsService('dynamodb');

        const dynamo = require('./dynamodb');
        dynamo.setupLogger(this._logger.sublogger('DynamoDB'));
        dynamo.dynamoDriver(dynamoDb);

        dynamo.getModel = (name) => {
            name = name.toLowerCase();
            var modelObj = dynamo.model(name);
            if (!modelObj) {
                this.logger.error('[DYNAMODB] MODEL %s NOT PRESENT. AVAILABLE MODELS: ', name, _.keys(dynamo.models));
                throw new Error('Dynamo Model ' + name + ' is not present.');
            }
            return modelObj;
        };

        dynamo.updateModel = (model, data, params) =>
            {
                if (!params) {
                    params = {};
                }
                this.logger.verbose('[DYNAMODB] UPDATE MODEL %s', model, data, params);

                return new Promise((resolve, reject) => {
                    dynamo.getModel(model).update(data, params, (err, obj) => {

                            if (err) {
                                if (err.code == 'ConditionalCheckFailedException') {
                                    resolve(null);
                                } else {
                                    this.logger.error('[DYNAMODB] UPDATE MODEL %s FAILED.', model, err, data, params);
                                    reject(err);
                                }
                            } else {
                                this.logger.verbose('[DYNAMODB] UPDATE MODEL %s DONE', model);
                                resolve(obj);
                            }

                        });
                });
            };

        dynamo.deleteModel = (model, data, params) =>
            {
                if (!params) {
                    params = {};
                }
                this.logger.verbose('[DYNAMODB] DELETE MODEL %s', model, data, params);

                return new Promise((resolve, reject) => {
                    dynamo.getModel(model).destroy(data, params, (err, obj) => {

                            if (err) {
                                if (err.code == 'ConditionalCheckFailedException') {
                                    resolve(null);
                                } else {
                                    this.logger.error('[DYNAMODB] DELETE MODEL %s FAILED.', model, err, data, params);
                                    reject(err);
                                }
                            } else {
                                this.logger.verbose('[DYNAMODB] DELETE MODEL %s DONE', model);
                                resolve(obj);
                            }

                        });
                });
            };


        return dynamo;
    }

    /***** MY SERVICES END ******/

    _getMyService(path)
    {
        if (!(path in this._myServices)) {
            this._logger.info('Constructing my service: %s...', path);
            const ServiceModule = require(path);
            this._myServices[path] = new ServiceModule(this);
        }
        return this._myServices[path];
    }

    getRawAwsService(name)
    {
        this._logger.info('Including aws service: %s...', name);
        const ServiceModule = require('aws-sdk/clients/' + name.toLowerCase());
        this._logger.info('Constructing aws service: %s...', name, this._serviceConfig);
        var awsService = new ServiceModule(this._serviceConfig)
        return awsService;
    }

    getAwsService(name)
    {
        if (!(name in this._awsServices)) {
            var awsServiceInfo = {
                name: name,
                throttlers: {},
                awsService: this.getRawAwsService(name)
            }
            this._constructWrappedService(awsServiceInfo);
            this._awsServices[name] = awsServiceInfo;
            this._logger.info('Constructed aws service: %s.', name);

        }
        return this._awsServices[name].proxy;
    }

    _constructWrappedService(awsServiceInfo)
    {
        var defaultWrapperConfig = this._throttlerConfig.default;
        
        var specificService = {};
        if (awsServiceInfo.name in this._throttlerConfig.byService)
        {
            specificService = this._throttlerConfig.byService[awsServiceInfo.name];
        } 
        if (!specificService.config) {
            specificService.config = {}
        }
        if (!specificService.actions) {
            specificService.actions = {};
        }

        specificService.config = _.defaults(specificService.config, defaultWrapperConfig);
        if (!('tag' in specificService.config)) {
            specificService.config.tag = ''
        }

        if (!specificService.config.shouldWrap)
        {
            awsServiceInfo.proxy = awsServiceInfo.awsService;
            return;
        }

        for(var x of _.keys(specificService.actions)) {
            specificService.actions[x] = _.defaults(specificService.actions[x], specificService.config)
            if (specificService.actions[x].tag == specificService.config.tag) {
                specificService.actions[x].tag = x
            }
        }

        var handler = {
            get: (target, propKey, receiver) => {
                const origMethod = target[propKey];
                return (...args) => {
                    var throttler = this._getThrottler(awsServiceInfo, propKey, specificService);
                    return throttler.execute(() => {
                        var result = origMethod.apply(target, args);
                        return result.promise();
                    }, propKey);
                };
            }
        };

        awsServiceInfo.proxy = new Proxy(awsServiceInfo.awsService, handler);
    }

    _getThrottler(awsServiceInfo, action, specificServiceConfig)
    {
        var config;
        if (action in specificServiceConfig.actions) {
            config = specificServiceConfig.actions[action];
        } else {
            config = specificServiceConfig.config;
        }

        if (config.tag in awsServiceInfo.throttlers) {
            return awsServiceInfo.throttlers[config.tag];
        }

        var throttler = null;
        if (config.concurrent) {
            throttler = new ConcurrentThrottler(this._logger.sublogger('CThrottler' + awsServiceInfo.name + config.tag), config);
        } else {
            throttler = new RateThrottler(this._logger.sublogger('RThrottler' + awsServiceInfo.name + config.tag), config);
        }
        awsServiceInfo.throttlers[config.tag] = throttler;
        return throttler;
    }

    shortenArn(arn) {
        var i = arn.indexOf('/');
        if (i == -1) {
            return arn;
        }
        var result = arn.substr(i+1);
        return result;

        var result = arn.match(/\S+\/(\S+)/i);
        if (result.length >= 2) {
            return result[1];
        }
        return arn;
    }

    toTagArray(tags)
    {
        var tagArray = [];
        for (var key of _.keys(tags)) {
            var val = tags[key];
            if (val) {
                val = val.toString();
            }
            tagArray.push({
                Key: key,
                Value: val
            });
        }
        if (tagArray.length == 0) {
            return null;
        }
        return tagArray;
    }

    setTagArrayValue(tags, key, value) {
        for (var tag of tags) {
            if (tag.Key === key) {
                tag.Value = value;
                return;
            }
        }
        tags.push({
            Key: key,
            Value: value
        });
    }

    getObjectTag(obj, key) {
        if (!obj.Tags) {
            return null;
        }
        for (var tag of obj.Tags) {
            if (tag.Key === key) {
                return tag.Value;
            }
        }
        return null;
    }
}

module.exports = AWSClient;
