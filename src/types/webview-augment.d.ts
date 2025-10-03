import { Uri } from 'vscode';

declare module 'vscode' {
  interface Webview {
    asWebviewUri(localResource: Uri): Uri;
    readonly cspSource: string;
  }
}

