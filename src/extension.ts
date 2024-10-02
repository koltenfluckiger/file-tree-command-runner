import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {spawn} from "child_process";

interface Command {
	name: string;
	command: string;
}

enum MessageType {
	error,
	info,
}
function isFile(path: string): boolean | Error {
	try {
		const stats = fs.statSync(path);
		if (stats.isFile()) {
			return true;
		} else if (stats.isDirectory()) {
			return false;
		}
	} catch (error) {
		return new Error("Path does not exist.");
	}
	return false;
}
function parseCommands(fileName: string): Command[] {
	let commands: Command[];
	try {
		if (!fs.existsSync(fileName)) {
			vscode.window.showErrorMessage(
				`Could not find ${fileName} in the workspace.`
			);
			return [];
		}

		const fileContent = fs.readFileSync(fileName, "utf-8");
		const parsedContent = JSON.parse(fileContent);
		commands = parsedContent.commands;
		return commands;
	} catch (error) {
		vscode.window.showErrorMessage(`Could not read or parse ${fileName}.`);
		return [];
	}
}

function getConfig(): {fileName: string; debugMode: boolean} {
	const config = vscode.workspace.getConfiguration("fileTreeCommandRunner");
	const fileName = config.get<string>(
		"fileName",
		"file-tree-command-runner.json"
	);
	const debugMode = config.get<boolean>("debugMode", false);
	return {fileName: fileName, debugMode: debugMode};
}

function showMessage(
	message: string,
	messageType: MessageType = MessageType.info
): void {
	switch (messageType) {
		case MessageType.error:
			vscode.window.showErrorMessage(`${message}`);
			break;
		case MessageType.info:
			vscode.window.showInformationMessage(`${message}`);
			break;
		default:
			vscode.window.showInformationMessage(`${message}`);
			break;
	}
}
export function activate(context: vscode.ExtensionContext) {
	let runCLICommandOnFileDisposable = vscode.commands.registerCommand(
		"file-tree-command-runner.runCLICommandOnFile",
		async (uri: vscode.Uri) => {
			const {fileName, debugMode} = getConfig();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				showMessage("No workspace folder is open.", MessageType.error);
				return;
			}
			const workspaceRoot = workspaceFolders[0].uri.fsPath;

			const filePath = path.join(workspaceRoot, fileName);
			const commands = parseCommands(filePath);
			const selectedCommandName = await vscode.window.showQuickPick(
				commands.map((c) => c.name),
				{
					placeHolder: "Select a command to run on file",
				}
			);
			const commandFile = uri.fsPath;
			if (selectedCommandName) {
				const selectedCommand = commands.find(
					(c) => c.name === selectedCommandName
				);

				if (selectedCommand) {
					if (debugMode) {
						showMessage(`${selectedCommand.command}`);
					}
					runCommandInBackground(`${selectedCommand.command} ${commandFile}`);
				}
			}
		}
	);
	let runCLICommandOnFileDirectoryDisposable = vscode.commands.registerCommand(
		"file-tree-command-runner.runCLICommandOnFileDirectory",
		async (uri: vscode.Uri) => {
			const {fileName, debugMode} = getConfig();
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				showMessage("No workspace folder is open.", MessageType.error);
				return;
			}
			const workspaceRoot = workspaceFolders[0].uri.fsPath;
			const filePath = path.join(workspaceRoot, fileName);
			const commands = parseCommands(filePath);
			const selectedCommandName = await vscode.window.showQuickPick(
				commands.map((c) => c.name),
				{
					placeHolder: "Select a command to run on file directory",
				}
			);
			const commandFile = uri.fsPath;
			const commandDirectory = isFile(commandFile)
				? path.dirname(commandFile)
				: commandFile;

			if (selectedCommandName) {
				const selectedCommand = commands.find(
					(c) => c.name === selectedCommandName
				);

				if (selectedCommand) {
					if (debugMode) {
						showMessage(`${selectedCommand.command} ${commandFile}`);
					}
					runCommandInBackground(
						`cd ${commandDirectory} && ${selectedCommand.command}`
					);
				}
			}
		}
	);
	let openSettings = vscode.commands.registerCommand(
		"file-tree-command-runner.openSettings",
		() => {
			vscode.commands.executeCommand(
				"workbench.action.openSettings",
				"fileTreeCommandRunner"
			);
		}
	);
	context.subscriptions.push(runCLICommandOnFileDisposable);
	context.subscriptions.push(runCLICommandOnFileDirectoryDisposable);
	context.subscriptions.push(openSettings);
}

export function deactivate() {}
/**
 * Runs a shell command in the background.
 * @param command The command to run.
 */
function runCommandInBackground(command: string, debugMode = false): void {
	// Spawn the command in a shell process
	const shell = spawn(command, {shell: true});

	// Optionally capture output and errors
	shell.stdout.on("data", (data) => {
		console.log(`stdout: ${data}`);
	});

	shell.stderr.on("data", (data) => {
		console.error(`stderr: ${data}`);
	});

	shell.on("close", (code) => {
		console.log(`Command exited with code ${code}`);
		if (code === 0) {
			if (debugMode) {
				showMessage(
					`Command "${command}" completed successfully.`,
					MessageType.info
				);
			}
		} else {
			if (debugMode) {
				showMessage(
					`Command "${command}" failed with exit code ${code}.`,
					MessageType.error
				);
			}
		}
	});
}
