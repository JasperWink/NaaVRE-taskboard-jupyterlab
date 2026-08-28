import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import { ICategory, IColumn, ITask } from './types';
import { ICardHandlers, TaskCard } from './TaskCard';
import { TaskFormDialog } from './TaskFormDialog';

export function Column({
  column,
  cards,
  categories,
  people,
  canDelete,
  draggingCard,
  onDropCard,
  onAddTask,
  onRenameColumn,
  onDeleteColumn,
  cardHandlers
}: {
  column: IColumn;
  cards: ITask[];
  categories: ICategory[];
  people: string[];
  canDelete: boolean;
  draggingCard: ITask | null;
  onDropCard: (
    columnId: string,
    anchorCardId: string | null,
    placeAfter: boolean
  ) => void;
  onAddTask: (
    columnId: string,
    fields: { title: string; description: string }
  ) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  cardHandlers: ICardHandlers;
}) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(column.title);
  const [addOpen, setAddOpen] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const commitRename = () => {
    const title = renameValue.trim();
    if (title) {
      onRenameColumn(column.id, title);
    }
    setRenaming(false);
  };

  return (
    <Box
      className={`naavre-task-column${isOver ? ' naavre-task-column-over' : ''}`}
      onDragOver={e => {
        if (draggingCard) {
          e.preventDefault();
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={e => {
        e.preventDefault();
        setIsOver(false);
        // Dropped on the column background: append to the end.
        onDropCard(column.id, null, false);
      }}
    >
      <Box className="naavre-task-column-header">
        {renaming ? (
          <InputBase
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                commitRename();
              } else if (e.key === 'Escape') {
                setRenaming(false);
              }
            }}
            sx={{ fontWeight: 600, flex: 1, fontSize: '0.9rem' }}
          />
        ) : (
          <Typography
            variant="subtitle2"
            sx={{ flex: 1, fontWeight: 600 }}
            onDoubleClick={() => {
              setRenameValue(column.title);
              setRenaming(true);
            }}
          >
            {column.title}
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ ml: 0.5 }}
            >
              {cards.length}
            </Typography>
          </Typography>
        )}
        <IconButton
          size="small"
          aria-label="Column actions"
          onClick={e => setMenuAnchor(e.currentTarget)}
        >
          <MoreHorizIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box className="naavre-task-column-body">
        {cards.map(card => (
          <Box
            key={card.id}
            onDragOver={e => {
              if (draggingCard) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              setIsOver(false);
              const rect = e.currentTarget.getBoundingClientRect();
              const placeAfter = e.clientY - rect.top > rect.height / 2;
              onDropCard(column.id, card.id, placeAfter);
            }}
          >
            <TaskCard
              card={card}
              categories={categories}
              people={people}
              handlers={cardHandlers}
            />
          </Box>
        ))}

        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{
            mt: 0.5,
            textTransform: 'none',
            justifyContent: 'flex-start'
          }}
          fullWidth
        >
          Add task
        </Button>
      </Box>

      <TaskFormDialog
        open={addOpen}
        heading="New task"
        initialTitle=""
        initialDescription=""
        onSave={fields => {
          onAddTask(column.id, fields);
          setAddOpen(false);
        }}
        onClose={() => setAddOpen(false)}
      />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setRenameValue(column.title);
            setRenaming(true);
            setMenuAnchor(null);
          }}
        >
          Rename
        </MenuItem>
        <Tooltip
          title={canDelete ? '' : 'The board must keep at least one column'}
          placement="right"
        >
          <span>
            <MenuItem
              disabled={!canDelete}
              onClick={() => {
                onDeleteColumn(column.id);
                setMenuAnchor(null);
              }}
            >
              Delete column
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
    </Box>
  );
}
