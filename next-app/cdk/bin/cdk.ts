#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Frontend } from '../lib/cdk-stack';

const app = new cdk.App();

const FrontEnd = new Frontend(app, 'FrontEndV3');
