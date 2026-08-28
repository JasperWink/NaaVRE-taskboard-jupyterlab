import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { ThemeProvider } from '@mui/material/styles';

import { theme } from '../../Theme';

import { IBoardState, ICategory, ITask } from './types';
import {
  addCategory,
  addColumn,
  addPerson,
  addTask,
  buildCards,
  cardsForColumn,
  deleteCategory,
  deleteColumn,
  deletePerson,
  deleteTask,
  orderForInsertion,
  renameColumn,
  updateTask
} from './boardLogic';
import { ICardHandlers } from './TaskCard';
import { Column } from './Column';

export function TaskBoard({
  board,
  ready,
  updateBoard
}: {
  board: IBoardState;
  ready: boolean;
  updateBoard: (updater: (prev: IBoardState) => IBoardState) => void;
}) {
  const [draggingCard, setDraggingCard] = useState<ITask | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  const cards = useMemo(() => buildCards(board), [board]);

  const handleDropCard = (
    columnId: string,
    anchorCardId: string | null,
    placeAfter: boolean
  ) => {
    const dragged = draggingCard;
    setDraggingCard(null);
    if (!dragged) {
      return;
    }
    const colCards = cardsForColumn(cards, columnId).filter(
      c => c.id !== dragged.id
    );
    let index: number;
    if (anchorCardId === null || anchorCardId === dragged.id) {
      index = colCards.length;
    } else {
      const pos = colCards.findIndex(c => c.id === anchorCardId);
      index = pos === -1 ? colCards.length : pos + (placeAfter ? 1 : 0);
    }
    // No-op if dropped back in the exact same place.
    if (
      dragged.columnId === columnId &&
      colCards.length === cardsForColumn(cards, columnId).length - 1
    ) {
      const currentIndex = cardsForColumn(cards, columnId).findIndex(
        c => c.id === dragged.id
      );
      if (currentIndex === index) {
        return;
      }
    }
    const order = orderForInsertion(colCards, index);
    updateBoard((b: IBoardState) =>
      updateTask(b, dragged.id, { columnId, order })
    );
  };

  const cardHandlers: ICardHandlers = {
    onDragStart: (card: ITask) => setDraggingCard(card),
    onDragEnd: () => setDraggingCard(null),
    onSetAssignees: (card: ITask, assignees: string[]) =>
      updateBoard((b: IBoardState) => updateTask(b, card.id, { assignees })),
    onCreatePerson: (name: string) =>
      updateBoard((b: IBoardState) => addPerson(b, name)),
    onDeletePerson: (name: string) =>
      updateBoard((b: IBoardState) => deletePerson(b, name)),
    onSetCategories: (card: ITask, categoryIds: string[]) =>
      updateBoard((b: IBoardState) => updateTask(b, card.id, { categoryIds })),
    onCreateCategory: (category: ICategory) =>
      updateBoard((b: IBoardState) => addCategory(b, category)),
    onDeleteCategory: (id: string) =>
      updateBoard((b: IBoardState) => deleteCategory(b, id)),
    onEdit: (card: ITask, fields: { title: string; description: string }) =>
      updateBoard((b: IBoardState) => updateTask(b, card.id, fields)),
    onDelete: (card: ITask) =>
      updateBoard((b: IBoardState) => deleteTask(b, card.id))
  };

  const commitAddColumn = () => {
    const title = newColumnTitle.trim();
    if (title) {
      updateBoard((b: IBoardState) => addColumn(b, title));
    }
    setNewColumnTitle('');
    setAddingColumn(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <Box className="naavre-task-board">
        <Box className="naavre-task-board-header">
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            Task Board
          </Typography>
        </Box>

        {!ready ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box className="naavre-task-board-columns">
            {board.columns.map(column => (
              <Column
                key={column.id}
                column={column}
                cards={cardsForColumn(cards, column.id)}
                categories={board.categories}
                people={board.people}
                canDelete={board.columns.length > 1}
                draggingCard={draggingCard}
                onDropCard={handleDropCard}
                onAddTask={(columnId, fields) =>
                  updateBoard((b: IBoardState) => addTask(b, columnId, fields))
                }
                onRenameColumn={(id, title) =>
                  updateBoard((b: IBoardState) => renameColumn(b, id, title))
                }
                onDeleteColumn={id =>
                  updateBoard((b: IBoardState) => deleteColumn(b, id))
                }
                cardHandlers={cardHandlers}
              />
            ))}

            <Box className="naavre-task-column naavre-task-add-column">
              {addingColumn ? (
                <Box sx={{ p: 1 }}>
                  <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    placeholder="Column name"
                    value={newColumnTitle}
                    onChange={e => setNewColumnTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        commitAddColumn();
                      } else if (e.key === 'Escape') {
                        setAddingColumn(false);
                        setNewColumnTitle('');
                      }
                    }}
                  />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1 }}
                    justifyContent="flex-end"
                  >
                    <Button
                      size="small"
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={commitAddColumn}
                    >
                      Add
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setAddingColumn(true)}
                  sx={{ m: 1, textTransform: 'none' }}
                >
                  Add column
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}
