import * as vscode from 'vscode';
import { Operation } from './operation';

var inMarkMode: boolean = false;
export function activate(context: vscode.ExtensionContext): void {
    //Start of my change
    function nextSexpEnd(s) {
        let atom_ = '[](){} \t\n\r';
        let spaces = ' \r\n\t';
        let pos = 0;
        function skip(that, toInclude) {
            while (pos < s.length && toInclude === that.includes(s[pos])) {
                pos++;
            }
        }
        function skipQ(Q) {
            pos++;
            while (pos < s.length && s[pos] !== Q) {
                if (s[pos] == '\\') {
                    pos += 2;
                } else {
                    pos++;
                }
            }
            pos++;
        }
        function skipSexp() {
            skip(spaces, true);
            if ('"\''.includes(s[pos])) {
                skipQ(s[pos]);
            }
            else if (!atom_.includes(s[pos])) {
                skip(atom_, false);
            }
            else if (s[pos] === '(') {
                skipParens(')');
            }
            else if (s[pos] === '[') {
                skipParens(']');
            }
            else if (s[pos] === '{') {
                skipParens('}');
            }
            return;
        }
        function skipParens(par) {
            pos++;
            while (s[pos] !== par) {
                if (pos >= s.length) {
                    return;
                }
                let oldPos = pos;
                skipSexp();
                if (oldPos == pos) {
                    break;
                }
            }
            pos++;
            return;
        }
        skipSexp();
        return pos;
    }
    function selectionChanger(func) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let doc = editor.document;
        func(editor, doc);
    }
    function getCurrentOffset(editor, doc) {
        return doc.offsetAt(editor.selection.active);
    }
    function move(offset) {
        selectionChanger((editor, doc) => {
            let currentOffset = getCurrentOffset(editor, doc);
            let anchor = editor.selection.anchor;
            let newOffset = currentOffset + offset;
            let newActive = doc.positionAt(newOffset);
            editor.selection = new vscode.Selection(inMarkMode ? anchor : newActive, newActive);
        });
    }
    function moveForwardSexp() {
        selectionChanger((editor, doc) => {
            let s = doc.getText().slice(getCurrentOffset(editor, doc));
            let n = nextSexpEnd(s);
            move(n);
        });
    }
    function slurpSexp() {
        inMarkMode = true;
        selectionChanger((editor, doc) => {
            let anchorOffset = doc.offsetAt(editor.selection.anchor);
            let s = doc.getText().slice(anchorOffset);
            let n = nextSexpEnd(s);
            anchorOffset += n;
            let newAnchor = doc.positionAt(anchorOffset);
            editor.selection = new vscode.Selection(newAnchor, editor.selection.active);
        });
    }
    function moveBackwardSexp() {
        selectionChanger((editor, doc) => {
            let s = doc.getText().slice(0, getCurrentOffset(editor, doc)).split('').reverse().map((s) => {
                if (s === '(') {
                    return ')';
                }
                else if (s === ')') {
                    return '(';
                }
                else if (s === '{') {
                    return '}';
                }
                else if (s === '}') {
                    return '{';
                }
                else if (s === '[') {
                    return ']';
                }
                else if (s === ']') {
                    return '[';
                }
                else {
                    return s;
                }
            }).join('');
            let n = nextSexpEnd(s);
            move(-n);
        });
    }
    function insertReturn() {
        let callback = (editBuilder:vscode.TextEditorEdit) => {
            let currentSelection = vscode.window.activeTextEditor.selection;
            editBuilder.insert(currentSelection.active, "\n");
        }
        vscode.window.activeTextEditor.edit(callback);
    }
    let subs = context.subscriptions;
    subs.push(vscode.commands.registerCommand('insertReturn', () => insertReturn()));
    subs.push(vscode.commands.registerCommand('emacs.moveForwardSexp', () => moveForwardSexp()));
    subs.push(vscode.commands.registerCommand('emacs.moveBackwardSexp', () => moveBackwardSexp()));
    subs.push(vscode.commands.registerCommand('emacs.slurpSexp', () => slurpSexp()));
    //end of my change

    let op = new Operation(),
        commandList: string[] = [
            "C-g",

            // Edit
            "C-k", "C-w", "M-w", "C-y", "C-x_C-o",
            "C-x_u", "C-/",

            // R-Mode
            "C-x_r"
        ],
        cursorMoves: string[] = [
            "cursorUp", "cursorDown", "cursorLeft", "cursorRight",
            "cursorHome", "cursorEnd",
            "cursorWordLeft", "cursorWordRight",
            "cursorPageDown", "cursorPageUp",
            "cursorTop", "cursorBottom"
        ];

    commandList.forEach(commandName => {
        context.subscriptions.push(registerCommand(commandName, op));
    });

    cursorMoves.forEach(element => {
        context.subscriptions.push(vscode.commands.registerCommand(
            "emacs." + element, () => {
                vscode.commands.executeCommand(
                    inMarkMode ?
                        element + "Select" :
                        element
                );
            })
        )
    });

    // 'type' is not an "emacs." command and should be registered separately
    context.subscriptions.push(vscode.commands.registerCommand("type", function (args) {
        if (!vscode.window.activeTextEditor) {
            return;
        }
        op.onType(args.text);
    }));

    initMarkMode(context);
}

export function deactivate(): void {
}

function initMarkMode(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand(
        'emacs.enterMarkMode', () => {
            initSelection();
            inMarkMode = true;
            vscode.window.setStatusBarMessage("Mark Set", 1000);
        })
    );

    context.subscriptions.push(vscode.commands.registerCommand(
        'emacs.exitMarkMode', () => {
            vscode.commands.executeCommand("cancelSelection");
            if (inMarkMode) {
                inMarkMode = false;
                vscode.window.setStatusBarMessage("Mark deactivated", 1000);
            }
        })
    );
}

function registerCommand(commandName: string, op: Operation): vscode.Disposable {
    return vscode.commands.registerCommand("emacs." + commandName, op.getCommand(commandName));
}

function initSelection(): void {
    var currentPosition: vscode.Position = vscode.window.activeTextEditor.selection.active;
    vscode.window.activeTextEditor.selection = new vscode.Selection(currentPosition, currentPosition);
}
