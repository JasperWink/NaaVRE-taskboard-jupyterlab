import React, { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';

import { getVariableColor, initials } from './avatarUtils';

/**
 * Manage the list of people assigned to a card. Adding a name keeps the input
 * open (the "add" affordance stays) so several people can be added in a row,
 * and each assignee can be removed individually.
 */
export function AssigneeEditor({
  assignees,
  onChange
}: {
  assignees: string[];
  onChange: (assignees: string[]) => void;
}) {
  const [value, setValue] = useState('');

  const add = () => {
    const name = value.trim();
    if (name && !assignees.includes(name)) {
      onChange([...assignees, name]);
    }
    setValue('');
  };

  const remove = (name: string) => {
    onChange(assignees.filter(a => a !== name));
  };

  return (
    <Box sx={{ p: 1.5, width: 250 }}>
      <Typography variant="caption" color="text.secondary">
        Assignees
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>
        {assignees.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No one assigned yet
          </Typography>
        )}
        {assignees.map(a => (
          <Chip
            key={a}
            size="small"
            label={a}
            onDelete={() => remove(a)}
            avatar={
              <Avatar sx={{ bgcolor: getVariableColor(a) }}>
                {initials(a)}
              </Avatar>
            }
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Add a person"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={add}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}
