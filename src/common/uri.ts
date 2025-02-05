/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as pathUtils from 'path';
import * as vscode from 'vscode';
import { Repository } from '../api/api';
import { PullRequestModel } from '../github/pullRequestModel';
import { GitChangeType } from './file';
import { TemporaryState } from './temporaryState';

export interface ReviewUriParams {
	path: string;
	ref?: string;
	commit?: string;
	base: boolean;
	isOutdated: boolean;
	rootPath: string;
}

export function fromReviewUri(query: string): ReviewUriParams {
	return JSON.parse(query);
}

export interface PRUriParams {
	baseCommit: string;
	headCommit: string;
	isBase: boolean;
	fileName: string;
	prNumber: number;
	status: GitChangeType;
	remoteName: string;
}

export function fromPRUri(uri: vscode.Uri): PRUriParams | undefined {
	try {
		return JSON.parse(uri.query) as PRUriParams;
	} catch (e) { }
}

export interface GitHubUriParams {
	fileName: string;
	branch: string;
	isEmpty?: boolean;
}
export function fromGitHubURI(uri: vscode.Uri): GitHubUriParams | undefined {
	try {
		return JSON.parse(uri.query) as GitHubUriParams;
	} catch (e) { }
}

export interface GitUriOptions {
	replaceFileExtension?: boolean;
	submoduleOf?: string;
	base: boolean;
}

const ImageMimetypes = ['image/png', 'image/gif', 'image/jpeg', 'image/webp', 'image/tiff', 'image/bmp'];

// a 1x1 pixel transparent gif, from http://png-pixel.com/
export const EMPTY_IMAGE_URI = vscode.Uri.parse(
	`data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==`,
);

export async function asImageDataURI(uri: vscode.Uri, repository: Repository): Promise<vscode.Uri | undefined> {
	try {
		const { commit, baseCommit, headCommit, isBase, path } = JSON.parse(uri.query);
		const ref = uri.scheme === 'review' ? commit : isBase ? baseCommit : headCommit;
		const { object } = await repository.getObjectDetails(ref, uri.fsPath);
		const { mimetype } = await repository.detectObjectType(object);

		if (mimetype === 'text/plain') {
			return;
		}

		if (ImageMimetypes.indexOf(mimetype) > -1) {
			const contents = await repository.buffer(ref, uri.fsPath);
			return TemporaryState.write(pathUtils.dirname(path), pathUtils.basename(path), contents);
		}
	} catch (err) {
		return;
	}
}

export function toReviewUri(
	uri: vscode.Uri,
	filePath: string | undefined,
	ref: string | undefined,
	commit: string,
	isOutdated: boolean,
	options: GitUriOptions,
	rootUri: vscode.Uri,
): vscode.Uri {
	const params: ReviewUriParams = {
		path: filePath ? filePath : uri.path,
		ref,
		commit: commit,
		base: options.base,
		isOutdated,
		rootPath: rootUri.path,
	};

	let path = uri.path;

	if (options.replaceFileExtension) {
		path = `${path}.git`;
	}

	return uri.with({
		scheme: 'review',
		path,
		query: JSON.stringify(params),
	});
}

export interface FileChangeNodeUriParams {
	prNumber: number;
	fileName: string;
	status?: GitChangeType;
}

export function toResourceUri(uri: vscode.Uri, prNumber: number, fileName: string, status: GitChangeType) {
	const params = {
		prNumber: prNumber,
		fileName: fileName,
		status: status,
	};

	return uri.with({
		scheme: 'filechange',
		query: JSON.stringify(params),
	});
}

export function fromFileChangeNodeUri(uri: vscode.Uri): FileChangeNodeUriParams | undefined {
	try {
		return uri.query ? JSON.parse(uri.query) as FileChangeNodeUriParams : undefined;
	} catch (e) { }
}

export function toPRUri(
	uri: vscode.Uri,
	pullRequestModel: PullRequestModel,
	baseCommit: string,
	headCommit: string,
	fileName: string,
	base: boolean,
	status: GitChangeType,
): vscode.Uri {
	const params: PRUriParams = {
		baseCommit: baseCommit,
		headCommit: headCommit,
		isBase: base,
		fileName: fileName,
		prNumber: pullRequestModel.number,
		status: status,
		remoteName: pullRequestModel.githubRepository.remote.remoteName,
	};

	const path = uri.path;

	return uri.with({
		scheme: 'pr',
		path,
		query: JSON.stringify(params),
	});
}

export enum Schemas {
	file = 'file'
}

export function resolvePath(from: vscode.Uri, to: string) {
	if (from.scheme === Schemas.file) {
		return pathUtils.resolve(from.fsPath, to);
	} else {
		return pathUtils.posix.resolve(from.path, to);
	}
}

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}
}

export const handler = new UriEventHandler();
