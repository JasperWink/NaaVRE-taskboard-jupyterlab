import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { CATEGORY_COLORS, ICategory, generateId } from './types';

/**
 * Toggle which categories are assigned to a card and create brand-new
 * categories (name + color). Creating a category immediately assigns it.
 */
export function CategoryEditor({
  categories,
  selectedIds,
  onToggle,
  onCreate,
  onDeleteCategory
}: {
  categories: ICategory[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate: (category: ICategory) => void;
  onDeleteCategory: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onCreate({ id: generateId('cat'), name: trimmed, color });
    setName('');
  };

  return (
    <Box sx={{ p: 1.5, width: 270 }}>
      <Typography variant="caption" color="text.secondary">
        Categories
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>
        {categories.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No categories yet
          </Typography>
        )}
        {categories.map(c => {
          const on = selectedIds.includes(c.id);
          return (
            <Chip
              key={c.id}
              size="small"
              label={c.name}
              onClick={() => onToggle(c.id)}
              onDelete={() => onDeleteCategory(c.id)}
              deleteIcon={
                <Tooltip title="Delete category">
                  <DeleteOutlineIcon />
                </Tooltip>
              }
              variant={on ? 'filled' : 'outlined'}
              sx={{
                cursor: 'pointer',
                bgcolor: on ? c.color : 'transparent',
                color: on ? '#fff' : c.color,
                borderColor: c.color,
                '& .MuiChip-deleteIcon': {
                  color: on ? 'rgba(255,255,255,0.8)' : c.color
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
        New category
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75, mb: 1 }}>
        {CATEGORY_COLORS.map(col => (
          <IconButton
            key={col}
            size="small"
            aria-label={`color ${col}`}
            onClick={() => setColor(col)}
            sx={{ p: 0 }}
          >
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                bgcolor: col,
                outline:
                  color === col ? '2px solid var(--jp-ui-font-color1)' : 'none',
                outlineOffset: '2px'
              }}
            />
          </IconButton>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Category name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
        />
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={create}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
}
