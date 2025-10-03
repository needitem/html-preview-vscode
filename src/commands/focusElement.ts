/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { Command } from '../commandManager';

export class FocusElementCommand implements Command {
	public readonly id = '_html.focusElement';

	public execute(line: number, tag: string, className?: string, id?: string) {
		if (!vscode.window.activeTextEditor) {
			return;
		}

		// Get the document
		const document = vscode.window.activeTextEditor.document;
		const text = document.getText();

		// Split into lines
		const lines = text.split(/\r?\n/);

		// Find the element to focus/select
		let openLine = (line && line > 0) ? line - 1 : 0;
		if (tag) {
			let pattern = `<${tag}`;
			if (id) {
				pattern += `[^>]*id=["'][^"']*${id}[^"']*["']`;
			} else if (className) {
				pattern += `[^>]*class=["'][^"']*${className}[^"']*["']`;
			}
			pattern += `[^>]*>`;
			const regex = new RegExp(pattern, 'i');
			const startLineIdx = (line && line > 0) ? line - 1 : 0;
			for (let i = startLineIdx; i < lines.length; i++) {
				if (regex.test(lines[i])) { openLine = i; break; }
			}
		}

		// Compute selection range: whole element block
		const safeTag = (tag || '').toLowerCase();
		const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
		let endLine = openLine;
		if (safeTag && !voidTags.has(safeTag)) {
			const tagMatcher = new RegExp(`<\\s*\\/?\\s*${safeTag}[^>]*>`, 'ig');
			let depth = 0;
			let started = false;
			for (let i = openLine; i < lines.length; i++) {
				const lineText = lines[i];
				let m: RegExpExecArray | null;
				tagMatcher.lastIndex = 0;
				while ((m = tagMatcher.exec(lineText)) !== null) {
					const token = m[0];
					const isClosing = /^<\s*\//.test(token);
					const isSelfClosing = /\/>\s*$/.test(token) || /\/>/.test(token);
					if (!started && !isClosing) {
						started = true;
						if (isSelfClosing) {
							endLine = i; depth = 0;
						} else {
							depth = 1;
						}
					} else if (started) {
						if (isClosing) { depth -= 1; }
						else if (!isSelfClosing) { depth += 1; }
					}
					if (started && depth === 0) { endLine = i; break; }
				}
				if (started && depth === 0) { break; }
			}
		}

		const startPos = new vscode.Position(openLine, 0);
		const endPos = new vscode.Position(endLine, lines[endLine] ? lines[endLine].length : 0);
		const fullSelection = new vscode.Selection(startPos, endPos);
		vscode.window.activeTextEditor.revealRange(fullSelection, vscode.TextEditorRevealType.InCenter);
		vscode.window.activeTextEditor.selection = fullSelection;
	}
}
