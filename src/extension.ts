import * as YAML from "yaml";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {spawn} from "child_process";

interface Command {
  name: string;
  command: string | string[];
}

enum MessageType {
  error,
  info,
}

const outputChannel = vscode.window.createOutputChannel(
  "File Tree Command Runner"
);

function logMessage(message: any) {
  outputChannel.appendLine(`[FileTree] ${message}`);
}
function getOSPlatform(): "windows" | "linux" | "mac" | "unknown" {
  const {platform} = process;
  switch (platform) {
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    case "darwin":
      return "mac";
    default:
      return "unknown";
  }
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
function parseCommandsFromFile(fileName: string): Command[] {
  let commands: Command[] = [];
  try {
    if (!fs.existsSync(fileName)) {
      return [];
    }

    const stats = fs.statSync(fileName);
    if (!stats.isFile()) {
      throw new Error("Path exists but is not a file.");
    }

    const fileContent = fs.readFileSync(fileName, "utf-8");
    const parsedContent = YAML.parse(fileContent);
    commands = parsedContent.commands || [];
    return commands;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Could not read or parse ${fileName}: ${error}`
    );
    return [];
  }
}
function parseCommands(
  globalCommands: Command[],
  fileCommands: Command[] = []
): Command[] {
  return [...globalCommands, ...fileCommands];
}
function getConfig(): {
  fileName: string;
  debugMode: boolean;
  globalCommands: Command[];
  runCommandOnSave: boolean;
  enabledFileTypes: string[];
} {
  const config = vscode.workspace.getConfiguration("fileTreeCommandRunner");
  const fileName = config.get<string>(
    "fileName",
    "file-tree-command-runner.yaml"
  );
  const debugMode = config.get<boolean>("debugMode", false);
  const globalCommands = config.get<Command[]>("globalCommands", []);
  const runCommandOnSave = config.get<boolean>("runCommandOnSave", false);
  const enabledFileTypes = config.get<string[]>("enabledFileTypes", []);

  return {
    fileName,
    debugMode,
    globalCommands,
    runCommandOnSave,
    enabledFileTypes,
  };
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
    default:
      vscode.window.showInformationMessage(`${message}`);
      break;
  }
}

function normalizeCommand(
  command: string | string[],
  cwd: string,
  os: string
): string {
  const separator = os === "windows" ? "&&" : "&&";

  // If it's an array, treat each string as a separate command
  const commands = Array.isArray(command) ? command : [command.trim()]; // Don't split by `;`

  const processed = commands.map((c) => {
    if (os === "windows") {
      return c.replace(/'([^']+)'/g, `"$1"`);
    }
    return c;
  });
  return `cd ${cwd} ${separator} ${processed.join(` ${separator} `)}`;
}
function isDir(path: string) {
  try {
    const stat = fs.lstatSync(path);
    return stat.isDirectory();
  } catch (e) {
    logMessage(e);
    return false;
  }
}
export function activate(context: vscode.ExtensionContext) {
  let runCLICommandOnFileDisposable = vscode.commands.registerCommand(
    "file-tree-command-runner.runCLICommandOnFile",
    async (uri: vscode.Uri) => {
      const {fileName, debugMode, globalCommands} = getConfig();
      const {workspaceFolders} = vscode.workspace;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        showMessage("No workspace folder is open.", MessageType.error);
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const filePath = path.join(workspaceRoot, fileName);
      const fileCommands = fs.existsSync(filePath)
        ? parseCommandsFromFile(filePath)
        : [];
      const allCommands = parseCommands(globalCommands, fileCommands);
      const selectedCommandName = await vscode.window.showQuickPick(
        allCommands.map((c) => c.name),
        {
          placeHolder: "Select a command to run on file",
        }
      );
      const commandFile = uri.fsPath;
      if (selectedCommandName) {
        const selectedCommand = allCommands.find(
          (c) => c.name === selectedCommandName
        );
        if (selectedCommand) {
          if (debugMode) {
            logMessage(`${selectedCommand.command}`);
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
      const os = getOSPlatform();
      const {fileName, debugMode, globalCommands} = getConfig();
      const {workspaceFolders} = vscode.workspace;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        showMessage("No workspace folder is open.", MessageType.error);
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const filePath = isDir(uri.fsPath)
        ? path.join(uri.fsPath, fileName || "file-tree-command-runner.yaml")
        : path.join(workspaceRoot, fileName || "file-tree-command-runner.yaml");

      logMessage(filePath);
      logMessage(uri.fsPath);
      const fileCommands = fs.existsSync(filePath)
        ? parseCommandsFromFile(filePath)
        : [];
      logMessage(`${fileCommands}`);
      const commandFile = uri.fsPath;

      const commandDirectory = isFile(commandFile)
        ? path.dirname(commandFile)
        : commandFile;
      logMessage(`${commandFile}, ${commandDirectory}`);
      const allCommands = parseCommands(globalCommands, fileCommands);
      const selectedCommandName = await vscode.window.showQuickPick(
        allCommands.map((c) => c.name),
        {
          placeHolder: "Select a command to run on file",
        }
      );
      if (selectedCommandName) {
        const selectedCommand = allCommands.find(
          (c) => c.name === selectedCommandName
        );
        if (selectedCommand) {
          const fullCommand = normalizeCommand(
            selectedCommand.command,
            commandDirectory,
            os
          );
          if (debugMode) {
            logMessage(`Executing: ${fullCommand}`);
          }
          runCommandInBackground(fullCommand);
        }
      }
    }
  );

  let onSaveDisposable = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const {
        fileName,
        debugMode,
        globalCommands,
        runCommandOnSave,
        enabledFileTypes,
      } = getConfig();
      if (!runCommandOnSave) {
        return;
      }
      const filePath = document.uri.fsPath;
      if (!enabledFileTypes.some((ext) => filePath.endsWith(ext))) {
        return;
      }
      const os = getOSPlatform();
      const {workspaceFolders} = vscode.workspace;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const commandDirectory = isFile(filePath)
        ? path.dirname(filePath)
        : filePath;
      const yamlPath = path.join(workspaceRoot, fileName);
      const fileCommands = fs.existsSync(yamlPath)
        ? parseCommandsFromFile(yamlPath)
        : [];
      const allCommands = parseCommands(globalCommands, fileCommands);
      const selectedCommand =
        allCommands.find((c) => c.name === "On Save") || null;
      if (selectedCommand) {
        const fullCommand = normalizeCommand(
          selectedCommand.command,
          commandDirectory,
          os
        );
        if (debugMode) {
          showMessage(`[FileTree] Running on save: ${fullCommand}`);
          logMessage(`Running on save: ${fullCommand}`);
        }
        runCommandInBackground(fullCommand, debugMode);
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
  context.subscriptions.push(onSaveDisposable);

  logMessage("File Tree Command Runner Initialized...");
}

export function deactivate() {}

function runCommandInBackground(command: string, debugMode = false): void {
  const shell = spawn(command, {
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  shell.stdout.setEncoding("utf8");
  shell.stderr.setEncoding("utf8");

  if (debugMode) {
    showMessage("Starting command...");
    outputChannel.show(false);
  }

  shell.stdout.on("data", (data) => {
    outputChannel.append(`[stdout] ${data}`);
  });

  shell.stderr.on("data", (data) => {
    outputChannel.append(`[stderr] ${data}`);
  });

  shell.on("close", (code) => {
    if (debugMode) {
      logMessage(`Command "${command}" exited with code ${code}.`);
    }
    if (code === 0) {
      if (debugMode) {
        showMessage(`✅ "${command}" completed successfully.`);
        logMessage(`Command "${command}" exited with code ${code}.`);
      }
    } else if (debugMode) {
      logMessage(`Command "${command}" exited with code ${code}.`);
      showMessage(
        `❌ "${command}" failed with exit code ${code}.`,
        MessageType.error
      );
    }
  });

  // Detach so it doesn't block or linger
  shell.unref();
}
