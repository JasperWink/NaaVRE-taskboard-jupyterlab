import React, { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';

import { ICategory, ITask } from './types';
import { getVariableColor, initials } from './avatarUtils';
import { AssigneeEditor } from './AssigneeEditor';
import { CategoryEditor } from './CategoryEditor';
import { TaskFormDialog } from './TaskFormDialog';

export interface ICardHandlers {
  onDragStart: (card: ITask) => void;
  onDragEnd: () => void;
  onSetAssignees: (card: ITask, assignees: string[]) => void;
  onSetCategories: (card: ITask, categoryIds: string[]) => void;
  onCreateCategory: (category: ICategory) => void;
  onDeleteCategory: (id: string) => void;
  onEdit: (card: ITask, fields: { title: string; description: string }) => void;
  onDelete: (card: ITask) => void;
}

export function TaskCard({
  card,
  categories,
  handlers
}: {
  card: ITask;
  categories: ICategory[];
  handlers: ICardHandlers;
}) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [assignAnchor, setAssignAnchor] = useState<null | HTMLElement>(null);
  const [categoryAnchor, setCategoryAnchor] = useState<null | HTMLElement>(
    null
  );
  const [editOpen, setEditOpen] = useState(false);

  const cardCategories = card.categoryIds
    .map(id => categories.find(c => c.id === id))
    .filter((c): c is ICategory => Boolean(c));

  const toggleCategory = (id: string) => {
    const next = card.categoryIds.includes(id)
      ? card.categoryIds.filter(c => c !== id)
      : [...card.categoryIds, id];
    handlers.onSetCategories(card, next);
  };

  const createCategory = (category: ICategory) => {
    handlers.onCreateCategory(category);
    handlers.onSetCategories(card, [...card.categoryIds, category.id]);
  };

  return (
    <Paper
      variant="outlined"
      className="naavre-task-card"
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        // Some browsers require data to be set for the drag to start.
        e.dataTransfer.setData('text/plain', card.id);
        handlers.onDragStart(card);
      }}
      onDragEnd={handlers.onDragEnd}
      sx={{ p: 1, mb: 1, cursor: 'grab' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Typography
          variant="body2"
          sx={{ flex: 1, fontWeight: 500, wordBreak: 'break-word' }}
        >
          {card.title || <em>Untitled</em>}
        </Typography>
        <IconButton
          size="small"
          aria-label="Card actions"
          onClick={e => setMenuAnchor(e.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      {card.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5, whiteSpace: 'pre-wrap' }}
        >
          {card.description}
        </Typography>
      )}

      {cardCategories.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {cardCategories.map(c => (
            <Chip
              key={c.id}
              label={c.name}
              size="small"
              sx={{ bgcolor: c.color, color: '#fff' }}
            />
          ))}
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 1
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {card.assignees.length > 0 && (
            <AvatarGroup
              max={4}
              sx={{
                '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 12 }
              }}
            >
              {card.assignees.map(a => (
                <Tooltip key={a} title={a}>
                  <Avatar sx={{ bgcolor: getVariableColor(a) }}>
                    {initials(a)}
                  </Avatar>
                </Tooltip>
              ))}
            </AvatarGroup>
          )}
          <Tooltip title="Assign people">
            <IconButton
              size="small"
              aria-label="Assign people"
              onClick={e => setAssignAnchor(e.currentTarget)}
            >
              <PersonAddAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Tooltip title="Categories">
          <IconButton
            size="small"
            aria-label="Categories"
            onClick={e => setCategoryAnchor(e.currentTarget)}
          >
            <LabelOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setEditOpen(true);
            setMenuAnchor(null);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            handlers.onDelete(card);
            setMenuAnchor(null);
          }}
        >
          Delete
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(assignAnchor)}
        anchorEl={assignAnchor}
        onClose={() => setAssignAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <AssigneeEditor
          assignees={card.assignees}
          onChange={a => handlers.onSetAssignees(card, a)}
        />
      </Popover>

      <Popover
        open={Boolean(categoryAnchor)}
        anchorEl={categoryAnchor}
        onClose={() => setCategoryAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <CategoryEditor
          categories={categories}
          selectedIds={card.categoryIds}
          onToggle={toggleCategory}
          onCreate={createCategory}
          onDeleteCategory={handlers.onDeleteCategory}
        />
      </Popover>

      <TaskFormDialog
        open={editOpen}
        heading="Edit task"
        initialTitle={card.title}
        initialDescription={card.description}
        onSave={fields => {
          handlers.onEdit(card, fields);
          setEditOpen(false);
        }}
        onClose={() => setEditOpen(false)}
      />
    </Paper>
  );
}
