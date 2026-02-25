import Note from "../models/noteModel.js";

export const createNote = async (req, res) => {
  try {
    const { courseId, lectureId, title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const note = await Note.create({
      userId: req.userId,
      courseId,
      lectureId,
      title,
      content,
    });

    return res.status(201).json(note);
  } catch (error) {
    return res.status(500).json({ message: `Create note failed: ${error}` });
  }
};

export const getNotes = async (req, res) => {
  try {
    const { courseId } = req.query;
    const filter = { userId: req.userId };
    if (courseId) filter.courseId = courseId;

    const notes = await Note.find(filter).sort({ updatedAt: -1 });
    return res.status(200).json(notes);
  } catch (error) {
    return res.status(500).json({ message: `Fetch notes failed: ${error}` });
  }
};

export const updateNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { title, content, lectureId } = req.body;

    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });
    if (note.userId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if (lectureId !== undefined) note.lectureId = lectureId;

    await note.save();
    return res.status(200).json(note);
  } catch (error) {
    return res.status(500).json({ message: `Update note failed: ${error}` });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });
    if (note.userId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await note.deleteOne();
    return res.status(200).json({ message: "Note deleted" });
  } catch (error) {
    return res.status(500).json({ message: `Delete note failed: ${error}` });
  }
};

