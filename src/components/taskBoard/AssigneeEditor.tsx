import React, { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { getVariableColor, initials } from './avatarUtils';

/**
 * Toggle which people are assigned to a card, and add people the board has not
 * seen before.
 *
 * The board keeps a roster of everyone who has been added to it (see
 * `IBoardState.people`), so a name is typed once and picked from a list after
 * that — the same way categories work. Removing someone from this card leaves
 * them on the roster; the bin icon on a chip removes them from the board
 * entirely, unassigning them everywhere.
 */
export function AssigneeEditor({
  people,
  assignees,
  onToggle,
  onCreate,
  onDeletePerson
}: {
  people: string[];
  assignees: string[];
  onToggle: (name: string) => void;
  onCreate: (name: string) => void;
  onDeletePerson: (name: string) => void;
}) {
  const [value, setValue] = useState('');

  const add = () => {
    const name = value.trim();
    if (!name) {
      return;
    }
    onCreate(name);
    setValue('');
  };

  return (
    <Box sx={{ p: 1.5, width: 270 }}>
      <Typography variant="caption" color="text.secondary">
        Assignees
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>
        {people.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No one on this board yet
          </Typography>
        )}
        {people.map(name => {
          const on = assignees.includes(name);
          const color = getVariableColor(name);
          return (
            <Chip
              key={name}
              size="small"
              label={name}
              onClick={() => onToggle(name)}
              onDelete={() => onDeletePerson(name)}
              deleteIcon={
                <Tooltip title="Remove from the board">
                  <DeleteOutlineIcon />
                </Tooltip>
              }
              variant={on ? 'filled' : 'outlined'}
              avatar={<Avatar sx={{ bgcolor: color }}>{initials(name)}</Avatar>}
              sx={{
                cursor: 'pointer',
                bgcolor: on ? color : 'transparent',
                color: on ? '#fff' : color,
                borderColor: color,
                '& .MuiChip-deleteIcon': {
                  color: on ? 'rgba(255,255,255,0.8)' : color
                }
              }}
            />
          );
        })}
      </Box>

      <Divider />

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 1, display: 'block' }}
      >
        Add someone
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.75 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Name"
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
