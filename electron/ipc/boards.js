import { v } from "../security/validate.js";

export function registerBoardHandlers(handle, ctx) {
  const { repo } = ctx;
  handle("boards:create", (p) => {
    const board = repo.createBoard(v.obj(p).name);
    return { id: board.id, name: board.name };
  });
  handle("boards:get", (p) => repo.getBoard(v.obj(p).id));
  handle("boards:save", (p) => {
    const { id, name, data_json } = v.obj(p);
    const b = repo.saveBoard(id, { name, data_json });
    return { id: b.id, name: b.name, updated_at: b.updated_at };
  });
  handle("boards:delete", (p) => repo.deleteBoard(v.obj(p).id));
}
