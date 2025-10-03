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
		
		// If we have a specific line, go to it first
		if (line && line > 0) {
			const position = new vscode.Position(line - 1, 0);
			const selection = new vscode.Selection(position, position);
			vscode.window.activeTextEditor.revealRange(selection);
			vscode.window.activeTextEditor.selection = selection;
		}

		// If we have additional element information, try to find the exact element
		if (tag) {
			// Create a regex pattern to find the element
			let pattern = `<${tag}`;
			
			// Add class or id to the pattern if available
			if (id) {
				pattern += `[^>]*id=["'][^"']*${id}[^"']*["']`;
			} else if (className) {
				pattern += `[^>]*class=["'][^"']*${className}[^"']*["']`;
			}
			
			pattern += `[^>]*>`;
			
			const regex = new RegExp(pattern, 'i');
			
			// Search for the element starting from the specified line
			const startLine = line ? line - 1 : 0;
			for (let i = startLine; i < lines.length; i++) {
				if (regex.test(lines[i])) {
					const position = new vscode.Position(i, 0);
					const selection = new vscode.Selection(position, position);
					vscode.window.activeTextEditor.revealRange(selection);
					vscode.window.activeTextEditor.selection = selection;
					break;
				}
			}
		}
	}
}