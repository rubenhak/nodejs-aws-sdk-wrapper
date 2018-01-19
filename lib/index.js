const Promise = require('the-promise');
const _ = require('lodash');
const path = require('path');

const Ec2Utils = require('./ec2-utils');

const Vpc = require('./services/vpc');
const RouteTable = require('./services/route-table');
const Subnet = require('./services/subnet');
const SecurityGroup = require('./services/security-group');
const LaunchConfiguration = require('./services/launch-configuration');
const AutoScalingGroup = require('./services/auto-scaling-group');
const Cluster = require('./services/cluster');
const InternetGateway = require('./services/internet-gateway');
const Repository = require('./services/repository');
const TaskDefinition = require('./services/task-definition');
const CloudWatch = require('./services/cloud-watch');
const ContainerInstance = require('./services/container-instance');
const Task = require('./services/task');
const HostedZone = require('./services/hosted-zone');
const Instance = require('./services/instance');
const Volume = require('./services/volume');
const NetworkInterface = require('./services/network-interface');
const LoadBalancing = require('./services/load-balancing');
const Policy = require('./services/policy');
const Role = require('./services/role');
const MessageQueue = require('./services/message-queue');
const Lambda = require('./services/lambda');
const AWS = require('aws-sdk');
const dynamo = require('dynamodb');

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

        this._serviceConfig = {
            region: this._region,
        }
        if (this._credentials.profile) {
            this._serviceConfig.credentials = new AWS.SharedIniFileCredentials(this._credentials.profile);
        }

        this.AWS = AWS;
        this._ecs = new AWS.ECS(this._serviceConfig);
        this._ec2 = new AWS.EC2(this._serviceConfig);
        this._autoscaling = new AWS.AutoScaling(this._serviceConfig);
        this._ecr = new AWS.ECR(this._serviceConfig);
        this._cloudwatchlogs = new AWS.CloudWatchLogs(this._serviceConfig);
        this._route53 = new AWS.Route53(this._serviceConfig);
        this._elb = new AWS.ELBv2(this._serviceConfig);
        this._iam = new AWS.IAM(this._serviceConfig);
        this._sqs = new AWS.SQS(this._serviceConfig);
        this._lambda = new AWS.Lambda(this._serviceConfig);
        this._dynamoDb = new AWS.DynamoDB(this._serviceConfig);

        this.Ec2utils = new Ec2Utils(this);
        this.Vpc = new Vpc(this);
        this.RouteTable = new RouteTable(this);
        this.Subnet = new Subnet(this);
        this.SecurityGroup = new SecurityGroup(this);
        this.LaunchConfiguration = new LaunchConfiguration(this);
        this.AutoScalingGroup = new AutoScalingGroup(this);
        this.Cluster = new Cluster(this);
        this.InternetGateway = new InternetGateway(this);
        this.Repository = new Repository(this);
        this.TaskDefinition = new TaskDefinition(this);
        this.CloudWatch = new CloudWatch(this);
        this.ContainerInstance = new ContainerInstance(this);
        this.Task = new Task(this);
        this.HostedZone = new HostedZone(this);
        this.Instance = new Instance(this);
        this.Volume = new Volume(this);
        this.NetworkInterface = new NetworkInterface(this);
        this.LoadBalancing = new LoadBalancing(this);
        this.Policy = new Policy(this);
        this.Role = new Role(this);
        this.MessageQueue = new MessageQueue(this);
        this.Lambda = new Lambda(this);
    }

    get logger() {
        return this._logger;
    }

    get region() {
        return this._region;
    }

    get DynamoDB() {
        dynamo.dynamoDriver(this._dynamoDb);
        return dynamo;
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
