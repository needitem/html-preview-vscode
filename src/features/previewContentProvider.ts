/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { Logger } from '../logger';
import { ContentSecurityPolicyArbiter, HTMLPreviewSecurityLevel } from '../security';
import { HTMLPreviewConfigurationManager, HTMLPreviewConfiguration } from './previewConfig';
import * as cheerio from "cheerio";

/**
 * Strings used inside the html preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
	cspAlertMessageText: localize(
		'preview.securityMessage.text',
		'Some content has been disabled in this document'),

	cspAlertMessageTitle: localize(
		'preview.securityMessage.title',
		'Potentially unsafe or insecure content has been disabled in the html preview. Change the HTML preview security setting to allow insecure content or enable scripts'),

	cspAlertMessageLabel: localize(
		'preview.securityMessage.label',
		'Content Disabled Security Warning')
};

export class HTMLContentProvider {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly cspArbiter: ContentSecurityPolicyArbiter,
		private readonly logger: Logger
	) { }

	private readonly TAG_RegEx = /^\s*?\<(p|h[1-6]|img|code|div|blockquote|li)((\s+.*?)(class="(.*?)")(.*?\>)|\>|\>|\/\>|\s+.*?\>)/;

	public provideTextDocumentContent(
		htmlDocument: vscode.TextDocument,
		previewConfigurations: HTMLPreviewConfigurationManager,
		initialLine: number | undefined = undefined,
		state?: any
	, webview?: vscode.Webview): string {
		const sourceUri = htmlDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			line: initialLine,
			lineCount: htmlDocument.lineCount,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings()
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
		const csp = this.getCspForResource(sourceUri, nonce, webview);

        const parsedDoc = htmlDocument.getText().split(/\r?\n/).map((l,i) => 
			l.replace(this.TAG_RegEx, (
				match: string, p1: string, p2: string, p3: string, 
				p4: string, p5: string, p6: string, offset: number) => 
			typeof p5 !== "string" ? 
			`<${p1} class="code-line" data-line="${i+1}" ${p2}` : 
			`<${p1} ${p3} class="${p5} code-line" data-line="${i+1}" ${p6}`)
        ).join("\n");
        const $ = cheerio.load(parsedDoc);
        const preJs = this.extensionResourcePath('pre.js', webview);
        const indexJs = this.extensionResourcePath('index.js', webview);
        const selCss = this.extensionResourcePath('selected-element.css', webview);
        const baseHref = webview
            ? webview.asWebviewUri(htmlDocument.uri).toString()
            : htmlDocument.uri.with({ scheme: 'vscode-resource' }).toString(true);
		$("head").prepend(`<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-html-preview-data"
					data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}"
					data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}"
					data-state="${JSON.stringify(state || {}).replace(/"/g, '&quot;')}">
				<link rel="stylesheet" href="${selCss}" type="text/css" media="screen">
				<script src="${preJs}" nonce="${nonce}"></script>
				<script src="${indexJs}" nonce="${nonce}"></script>
				${this.getStyles(sourceUri, config, webview)}
				<base href="${baseHref}">`);
		$("body").addClass(`vscode-body ${config.markEditorSelection ? 'showEditorSelection' : ''}`);
		return $.html();
	}

	private extensionResourcePath(mediaFile: string, webview?: vscode.Webview): string {
		const fileUri = vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile)));
		if (webview) {
			return webview.asWebviewUri(fileUri).toString();
		}
		return fileUri.with({ scheme: 'vscode-resource' }).toString();
	}

	private fixHref(resource: vscode.Uri, href: string, webview?: vscode.Webview): string {
		if (!href) {
			return href;
		}

		// Use href if it is already an URL
		const hrefUri = vscode.Uri.parse(href);
		if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
			return hrefUri.toString();
		}

		// Use href as file URI if it is absolute
		if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
			const file = vscode.Uri.file(href);
			return webview ? webview.asWebviewUri(file).toString() : file.with({ scheme: 'vscode-resource' }).toString();
		}

		// Use a workspace relative path if there is a workspace
		let root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			const file = vscode.Uri.file(path.join(root.uri.fsPath, href));
			return webview ? webview.asWebviewUri(file).toString() : file.with({ scheme: 'vscode-resource' }).toString();
		}

		// Otherwise look relative to the html file
		const file = vscode.Uri.file(path.join(path.dirname(resource.fsPath), href));
		return webview ? webview.asWebviewUri(file).toString() : file.with({ scheme: 'vscode-resource' }).toString();
	}

	private getStyles(resource: vscode.Uri, config: HTMLPreviewConfiguration, webview?: vscode.Webview): string {
		if (Array.isArray(config.styles)) {
			return config.styles.map(style => {
				return `<link rel="stylesheet" class="code-user-style" data-source="${style.replace(/"/g, '&quot;')}" href="${this.fixHref(resource, style, webview)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getCspForResource(resource: vscode.Uri, nonce: string, webview?: vscode.Webview): string {
		const source = webview ? webview.cspSource : 'vscode-resource:';
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
			case HTMLPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${source} http: https: data:; media-src ${source} http: https: data:; script-src https: ${source}; style-src ${source} 'unsafe-inline' http: https: data:; font-src ${source} http: https: data:;">`;

			case HTMLPreviewSecurityLevel.AllowInsecureLocalContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${source} https: data: http://localhost:* http://127.0.0.1:*; media-src ${source} https: data: http://localhost:* http://127.0.0.1:*; script-src https: ${source}; style-src ${source} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src ${source} https: data: http://localhost:* http://127.0.0.1:*;">`;

			case HTMLPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '';

			case HTMLPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${source} https: data:; media-src ${source} https: data:; script-src https: ${source}; style-src ${source} 'unsafe-inline' https: data:; font-src ${source} https: data:;">`;
		}
	}
}


