import React, { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

/**
 * Dialog for creating or editing a task's title and description. Used both when
 * adding a card (so a description can be entered immediately) and when editing
 * an existing one.
 */
export function TaskFormDialog({
  open,
  heading,
  initialTitle,
  initialDescription,
  onSave,
  onClose
}: {
  open: boolean;
  heading: string;
  initialTitle: string;
  initialDescription: string;
  onSave: (fields: { title: string; description: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);

  // Reset the fields whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setDescription(initialDescription);
    }
  }, [open, initialTitle, initialDescription]);

  const save = () => {
    if (!title.trim()) {
      return;
    }
    onSave({ title: title.trim(), description });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{heading}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus
            label="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                save();
              }
            }}
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            minRows={3}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!title.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
