# File Tree Command Runner

This VS Code extension allows you to run custom shell commands directly from the file explorer on files or folders. You can configure the commands in the extension settings or in a JSON file located in your workspace.

## Features

- **Run CLI commands on selected files or folders**: Right-click on any file or folder in the file explorer and select your custom command from the context menu.
- **Configure command file**: Customize the file name that contains your CLI commands using the VS Code settings.
- **Background execution**: Run shell commands in the background, with output and errors handled gracefully.

### Example Use Cases

- **Make files executable**: Quickly run `chmod +x` on a file.
- **List contents**: Execute commands like `ls -la` on a folder.
- **Custom scripts**: Run any shell commands or scripts on the selected files.

## Installation

1. Clone or download this repository.
2. Open the project in Visual Studio Code.
3. Install the required dependencies:
   ```bash
   npm install
   ```
4. Press `F5` to launch the extension in development mode.

## Usage

### Default Configuration

1. Open a folder in VS Code.
2. Right-click on a file or folder in the file explorer.
3. Select "Run CLI Command on File" from the context menu.

The extension will prompt you to confirm the execution of a command (e.g., `chmod +x`) on the selected file.

### Customizing the Command File

By default, the extension looks for a file named `file-tree-command-runner.json` in the root of your workspace. You can customize this filename via the VS Code settings.

#### Example JSON File (`file-tree-command-runner.json`)

```json
{
	"commands": [
		{
			"name": "Make Executable",
			"command": "chmod +x"
		},
		{
			"name": "List Files",
			"command": "ls -la"
		}
	]
}
```
