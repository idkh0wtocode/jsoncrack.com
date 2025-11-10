import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Group,
  TextInput,
  Textarea,
  JsonInput,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import toast from "react-hot-toast";
import useFile from "../../../store/useFile";
import type { NodeData, NodeRow } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Update JSON object at the specified path
const updateJsonAtPath = (jsonObj: any, path: NodeData["path"], newValue: any): any => {
  if (!path || path.length === 0) {
    return newValue;
  }

  const result = JSON.parse(JSON.stringify(jsonObj)); // Deep clone
  let current = result;

  // Navigate to the parent of the target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined) {
      current[key] = typeof path[i + 1] === "number" ? [] : {};
    }
    current = current[key];
  }

  // Set the new value
  const finalKey = path[path.length - 1];
  current[finalKey] = newValue;

  return result;
};

// Convert node text to editable object
const nodeTextToEditableObject = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return {};
  if (nodeRows.length === 1 && !nodeRows[0].key) return { value: nodeRows[0].value };

  const obj: Record<string, any> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return obj;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const contents = useFile(state => state.contents);
  const setContents = useFile(state => state.setContents);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editableData, setEditableData] = React.useState<Record<string, any>>({});
  const [originalData, setOriginalData] = React.useState<Record<string, any>>({});

  // Reset state when modal opens/closes or node changes
  React.useEffect(() => {
    if (opened && nodeData) {
      const editable = nodeTextToEditableObject(nodeData.text);
      setEditableData(editable);
      setOriginalData(editable);
      setIsEditing(false);
    }
  }, [opened, nodeData]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditableData(originalData);
    setIsEditing(false);
  };

  const handleSave = () => {
    try {
      if (!nodeData?.path) {
        toast.error("Cannot update root level data");
        return;
      }

      const currentJson = JSON.parse(contents);
      let newValue: any;

      // Handle single value vs object
      if (Object.keys(editableData).length === 1 && editableData.value !== undefined) {
        newValue = editableData.value;
      } else {
        newValue = editableData;
      }

      // Convert string numbers to actual numbers if they were originally numbers
      if (
        nodeData.text.length === 1 &&
        nodeData.text[0].type === "number" &&
        typeof newValue === "string"
      ) {
        const numValue = Number(newValue);
        if (!isNaN(numValue)) {
          newValue = numValue;
        }
      }

      // Convert string booleans to actual booleans if they were originally booleans
      if (
        nodeData.text.length === 1 &&
        nodeData.text[0].type === "boolean" &&
        typeof newValue === "string"
      ) {
        if (newValue.toLowerCase() === "true") newValue = true;
        else if (newValue.toLowerCase() === "false") newValue = false;
      }

      // Handle null values
      if (nodeData.text.length === 1 && nodeData.text[0].type === "null" && newValue === "null") {
        newValue = null;
      }

      const updatedJson = updateJsonAtPath(currentJson, nodeData.path, newValue);
      const jsonString = JSON.stringify(updatedJson, null, 2);

      // Use setContents to update both the file contents and trigger the graph update
      setContents({ contents: jsonString, hasChanges: true });
      setOriginalData(editableData);
      setIsEditing(false);

      toast.success("Node updated successfully");
    } catch (error) {
      console.error("Error updating node:", error);
      toast.error("Failed to update node");
    }
  };

  const handleInputChange = (key: string, value: any) => {
    setEditableData(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderEditableFields = () => {
    if (!nodeData?.text) return null;

    // Single value (string, number, boolean, null)
    if (nodeData.text.length === 1 && !nodeData.text[0].key) {
      const row = nodeData.text[0];
      return (
        <TextInput
          label="Value"
          value={editableData.value || ""}
          onChange={e => handleInputChange("value", e.target.value)}
          placeholder={`Enter ${row.type} value`}
        />
      );
    }

    // Object with key-value pairs
    return nodeData.text
      .filter(row => row.type !== "array" && row.type !== "object")
      .map((row, index) => (
        <TextInput
          key={index}
          label={row.key || "Value"}
          value={editableData[row.key!] || ""}
          onChange={e => handleInputChange(row.key!, e.target.value)}
          placeholder={`Enter ${row.type} value`}
        />
      ));
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group>
              {!isEditing ? (
                <Button size="xs" onClick={handleEdit}>
                  Edit
                </Button>
              ) : (
                <Group gap="xs">
                  <Button size="xs" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button size="xs" onClick={handleSave}>
                    Save
                  </Button>
                </Group>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          {isEditing ? (
            <Stack gap="sm">{renderEditableFields()}</Stack>
          ) : (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}
        </Stack>

        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
