const router = require('express').Router();
const pool = require('../db');
const authorization = require('../middleware/authorization');
const sanitizeHtml = require('sanitize-html');
const { transformToReadableDate } = require('../utils/transformDate');

const mime = require('mime-types');
const multer = require('multer');
const uuid = require('uuid').v4;
/* const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../uploads/');
    },
    filename: (req, file, cb) => {
        const { originalname } = file;
        cb(null, `${uuid()}-${originalname}`);
    },
}); */
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 100000000 } }); //100mb

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;
const FILE_EXPIRATION_TIME = 21600; //6ur

const s3 = new S3Client({
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        bucketName: bucketName,
    },
    region: bucketRegion,
});

router.get('/retrieve-all', authorization, upload.none(), async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const offset = (page - 1) * limit;

    try {
        const notes = await pool.query(
            `
        SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, 0 AS editing_permission, null as shared_by_email, tn.note_version
        FROM t_notes tn
        WHERE tn.user_id = $1

        UNION

        SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, sn.editing_permission, t_users_shared_by.user_email AS shared_by_email, tn.note_version
        FROM t_notes tn
        INNER JOIN t_shared_notes sn ON tn.note_id = sn.note_id
        INNER JOIN t_users t_users_shared_by ON sn.shared_by = t_users_shared_by.user_id
        INNER JOIN t_users t_users_shared_with ON sn.shared_with = t_users_shared_with.user_id
        WHERE t_users_shared_with.user_id = $1
        ORDER BY last_update DESC LIMIT $2 OFFSET $3;
        `,
            [req.user.id, limit, offset]
        );

        let finalNotes = notes.rows.map((note) => {
            note.last_update = transformToReadableDate(note.last_update);
            return note;
        });

        //presigned url
        finalNotes = await Promise.all(
            finalNotes.map(async (note) => {
                const attachments = await pool.query(
                    'SELECT attachment_id, file_name, file_original_name, null AS url, file_extension FROM t_attachments WHERE note_id=$1',
                    [note.note_id]
                );

                if (attachments.rows.length > 0) {
                    let atts = await Promise.all(
                        attachments.rows.map(async (attachment) => {
                            const getObjectParams = {
                                Bucket: bucketName,
                                Key: attachment.file_name,
                            };
                            const command = new GetObjectCommand(getObjectParams);
                            const url = await getSignedUrl(s3, command, { expiresIn: FILE_EXPIRATION_TIME });
                            attachment.url = url;
                            return attachment;
                        })
                    );
                    return { ...note, attachments: atts };
                } else {
                    return note;
                }
            })
        );
        res.json(finalNotes);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.post('/new-note', authorization, upload.array('attachments', 5), async (req, res) => {
    const { title, subject, content } = req.body;
    const cleanContent = sanitizeHtml(content.replace(/<p><\/p>/g, '<br>'));

    try {
        const newNote = await pool.query(
            'INSERT INTO t_notes (user_id, title, subject, content) VALUES($1, $2, $3, $4) RETURNING note_id, last_update, 0 AS editing_permission, null AS shared_by_email',
            [req.user.id, title, subject, cleanContent]
        );
        if (newNote.rows.length === 0) {
            return res.json({ msg: 'Failed to create the note' });
        }
        newNote.rows[0].last_update = transformToReadableDate(newNote.rows[0].last_update);
        let createdNote = { ...newNote.rows[0], title: title, subject: subject, content: cleanContent, shouldAnimate: 'temporary-gray', note_version: 1 };
        let newAttachmentList = [];

        if (req.files.length > 0) {
            const files = req.files;
            const uploadedFiles = await Promise.all(
                files.map(async (file) => {
                    const fileExtension = mime.extension(file.mimetype);
                    const generatedFileName = `${uuid()}-${file.originalname}`;
                    const params = {
                        Bucket: bucketName,
                        Key: generatedFileName,
                        Body: file.buffer,
                        ContentType: file.mimetype,
                    };
                    const command = new PutObjectCommand(params);
                    const s3UploadResponse = await s3.send(command);

                    const newAttachment = await pool.query(
                        'INSERT INTO t_attachments (note_id, file_original_name, file_name, file_extension) VALUES($1, $2, $3, $4) RETURNING attachment_id',
                        [newNote.rows[0].note_id, file.originalname, generatedFileName, fileExtension]
                    );

                    if (newAttachment.rows.length === 0) {
                        return res.json({ msg: 'Failed to upload attachments' });
                    }

                    const getObjectParams = {
                        Bucket: bucketName,
                        Key: generatedFileName,
                    };
                    const newCommand = new GetObjectCommand(getObjectParams);
                    const url = await getSignedUrl(s3, newCommand, { expiresIn: FILE_EXPIRATION_TIME });

                    newAttachment.rows[0] = {
                        ...newAttachment.rows[0],
                        url: url,
                        file_name: generatedFileName,
                        file_original_name: file.originalname,
                        file_extension: fileExtension,
                    };

                    newAttachmentList = [...newAttachmentList, newAttachment.rows[0]];
                })
            );

            createdNote = { ...createdNote, attachments: newAttachmentList };
        }
        res.json({ msg: 'Finished uploading', createdNote: createdNote });
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.put('/update-note/:id', authorization, upload.array('attachments', 5), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subject, content, filesToDelete, noteVersion } = req.body;
        const parsedFilesToDelete = JSON.parse(filesToDelete);
        //<p></p> taga zamenjamo z breaki ker rte tega ne naredi
        const cleanContent = sanitizeHtml(content.replace(/<p><\/p>/g, '<br>'));

        const previousVersion = await pool.query('SELECT note_version FROM t_notes WHERE note_id=$1', [id]);
        if (previousVersion.rows[0].note_version !== Number(noteVersion)) {
            return res.json('Old note version');
        }

        const noteAccess = await pool.query(
            'SELECT COALESCE(n.cnt, 0) AS note_count, COALESCE(s.shared_count, 0) AS shared_note_count FROM (SELECT COUNT(*) AS cnt FROM t_notes WHERE note_id=$1 AND user_id=$2) AS n LEFT JOIN (SELECT COUNT(*) AS shared_count FROM t_shared_notes WHERE note_id=$1 AND shared_with=$2 AND editing_permission=2) AS s ON true',
            [id, req.user.id]
        );

        if (noteAccess.rows[0].note_count == 0 && noteAccess.rows[0].shared_note_count == 0) {
            return res.status(401).json('Unauthorized access');
        }

        if (parsedFilesToDelete.length !== 0) {
            for (const file of parsedFilesToDelete) {
                const params = {
                    Bucket: bucketName,
                    Key: file.file_name,
                };
                const command = new DeleteObjectCommand(params);
                try {
                    await s3.send(command);

                    const deletedAttachments = await pool.query('DELETE FROM t_attachments WHERE note_id=$1 AND file_name=$2', [
                        file.note_id,
                        file.file_name,
                    ]);
                } catch (error) {
                    console.log(error.message);
                    return res.json('Error deleting file(s)');
                }
            }
        }

        const updatedNote = await pool.query(
            'UPDATE t_notes SET title=$1, subject=$2, content=$3, last_update=CURRENT_TIMESTAMP, note_version=note_version+1 WHERE note_id=$4 RETURNING last_update, note_version',
            [title, subject, cleanContent, id]
        );

        if (updatedNote.rows.length === 0) {
            return res.json('Error updating note');
        }

        updatedNote.rows[0].last_update = transformToReadableDate(updatedNote.rows[0].last_update);
        let updatedExNote = { ...updatedNote.rows[0], title: title, subject: subject, content: cleanContent, note_id: id };

        if (req.files.length !== 0) {
            try {
                const files = req.files;
                const uploadedFiles = await Promise.all(
                    files.map(async (file) => {
                        const fileExtension = mime.extension(file.mimetype);
                        const generatedFileName = `${uuid()}-${file.originalname}`;
                        const params = {
                            Bucket: bucketName,
                            Key: generatedFileName,
                            Body: file.buffer,
                            ContentType: file.mimetype,
                        };
                        const command = new PutObjectCommand(params);
                        const s3UploadResponse = await s3.send(command);

                        const newAttachment = await pool.query(
                            'INSERT INTO t_attachments (note_id, file_original_name, file_name, file_extension) VALUES($1, $2, $3, $4)',
                            [id, file.originalname, generatedFileName, fileExtension]
                        );
                    })
                );
            } catch (error) {
                console.log(error.message);
                return res.json('Error uploading file(s)');
            }
        }
        let atts = [];
        try {
            const attachments = await pool.query(
                'SELECT attachment_id, file_name, file_original_name, null AS url, file_extension FROM t_attachments WHERE note_id=$1',
                [id]
            );
            if (attachments.rows.length > 0) {
                atts = await Promise.all(
                    attachments.rows.map(async (attachment) => {
                        const getObjectParams = {
                            Bucket: bucketName,
                            Key: attachment.file_name,
                        };
                        const command = new GetObjectCommand(getObjectParams);
                        const url = await getSignedUrl(s3, command, { expiresIn: FILE_EXPIRATION_TIME });
                        attachment.url = url;
                        return attachment;
                    })
                );
            }
        } catch (error) {
            console.log(error.message);
            return res.json('Error retrieving file(s)');
        }

        updatedExNote = { ...updatedExNote, attachments: atts };
        res.json({ msg: 'Updated successfully', updatedNote: updatedExNote });
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.delete('/delete-note/:id', authorization, upload.none(), async (req, res) => {
    try {
        const { id } = req.params;

        const noteAccess = await pool.query('SELECT user_id FROM t_notes WHERE note_id=$1', [id]);
        if (noteAccess.rows.length === 0 || noteAccess.rows[0].user_id !== req.user.id) {
            return res.status(401).json('Unauthorized access');
        }

        const attachments = await pool.query('SELECT file_name FROM t_attachments WHERE note_id=$1', [id]);
        if (attachments.rows.length > 0) {
            attachments.rows.forEach(async (attachment) => {
                const params = {
                    Bucket: bucketName,
                    Key: attachment.file_name,
                };
                const command = new DeleteObjectCommand(params);
                await s3.send(command);
            });
        }
        const removedAccess = await pool.query('DELETE FROM t_shared_notes WHERE note_id=$1 AND shared_by=$2', [id, req.user.id]);

        const deleteAttachments = await pool.query('DELETE FROM t_attachments WHERE note_id=$1', [id]);
        const deleteNote = await pool.query('DELETE FROM t_notes WHERE note_id=$1 AND user_id=$2', [id, req.user.id]);
        if (deleteNote.rowCount === 0) {
            return res.json('Unauthorized access');
        }

        res.json('Deleted note');
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.get('/search-notes', authorization, upload.none(), async (req, res) => {
    try {
        const searchString = req.query.search;

        let searchedNotes = await pool.query(
            `
            SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, 0 AS editing_permission, null AS shared_by_email, tn.note_version
            FROM t_notes tn
            WHERE tn.user_id = $1 AND (tn.title ILIKE '%' || $2 || '%' OR tn.content ILIKE '%' || $2 || '%' OR tn.subject ILIKE '%' || $2 || '%')

            UNION

            SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, sn.editing_permission, t_users_shared_by.user_email AS shared_by_email, tn.note_version
            FROM t_notes tn
            INNER JOIN t_shared_notes sn ON tn.note_id = sn.note_id
            INNER JOIN t_users t_users_shared_by ON sn.shared_by = t_users_shared_by.user_id
            INNER JOIN t_users t_users_shared_with ON sn.shared_with = t_users_shared_with.user_id
            WHERE t_users_shared_with.user_id = $1 AND (tn.title ILIKE '%' || $2 || '%' OR tn.content ILIKE '%' || $2 || '%' OR tn.subject ILIKE '%' || $2 || '%')
            ORDER BY last_update DESC;
            `,
            [req.user.id, searchString]
        );

        if (searchedNotes.rows.length === 0) {
            return res.json('No notes found');
        }

        searchedNotes = searchedNotes.rows.map((note) => {
            note.last_update = transformToReadableDate(note.last_update);
            return note;
        });

        //presigned url
        searchedNotes = await Promise.all(
            searchedNotes.map(async (note) => {
                const attachments = await pool.query(
                    'SELECT attachment_id, file_name, file_original_name, null AS url, file_extension FROM t_attachments WHERE note_id=$1',
                    [note.note_id]
                );
                if (attachments.rows.length > 0) {
                    let atts = await Promise.all(
                        attachments.rows.map(async (attachment) => {
                            const getObjectParams = {
                                Bucket: bucketName,
                                Key: attachment.file_name,
                            };
                            const command = new GetObjectCommand(getObjectParams);
                            const url = await getSignedUrl(s3, command, { expiresIn: FILE_EXPIRATION_TIME });
                            attachment.url = url;
                            return attachment;
                        })
                    );
                    return { ...note, attachments: atts };
                } else {
                    return note;
                }
            })
        );
        res.json(searchedNotes);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.get('/sharee-data/:id', authorization, upload.none(), async (req, res) => {
    const { id } = req.params;
    try {
        const shareeData = await pool.query(
            'SELECT t.editing_permission, u.user_email AS shared_with_email FROM t_shared_notes AS t JOIN t_users AS u ON t.shared_with = u.user_id WHERE t.shared_by=$1 AND t.note_id=$2',
            [req.user.id, id]
        );
        res.json(shareeData.rows);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.post('/share/:id', authorization, upload.none(), async (req, res) => {
    const { id } = req.params;
    const { recipient, editingPermission } = req.body;
    let canEdit;
    if (editingPermission === true || editingPermission === 'true') {
        canEdit = 2;
    } else if (editingPermission === false || editingPermission === 'false') {
        canEdit = 1;
    }

    try {
        //če prejemnik sploh obstaja
        const targetRecipient = await pool.query('SELECT user_id FROM t_users WHERE user_email=$1', [recipient]);
        if (targetRecipient.rows.length === 0) {
            return res.json('User does not exist');
        }

        //če ta share že obstaja
        const existingShare = await pool.query('SELECT editing_permission FROM t_shared_notes WHERE note_id=$1 AND shared_with=$2', [
            id,
            targetRecipient.rows[0].user_id,
        ]);
        if (existingShare.rows.length > 0) {
            if (existingShare.rows[0].editing_permission !== canEdit) {
                const update = await pool.query('UPDATE t_shared_notes SET editing_permission=$1 WHERE note_id=$2 AND shared_with=$3', [
                    canEdit,
                    id,
                    targetRecipient.rows[0].user_id,
                ]);
                return res.json('Updated existing permission');
            } else {
                return res.json('No change');
            }
        }

        const targetNote = await pool.query('SELECT COUNT(*) AS cnt FROM t_notes WHERE user_id=$1 AND note_id=$2', [req.user.id, id]);
        //če je ta uporabnik lastnik nota
        if (targetNote.rows[0].cnt == 0) {
            return res.json('Note does not exist');
        }

        //vzamemo mail od userja ki shara note
        const sharingUser = await pool.query('SELECT user_email FROM t_users WHERE user_id=$1', [req.user.id]);
        if (sharingUser.rows.length === 0) {
            return res.json('User does not exist');
        }
        if (sharingUser.rows[0].user_email === recipient) {
            return res.json("You can't share note with yourself");
        }

        const sharedNote = await pool.query(
            'INSERT INTO t_shared_notes (note_id, shared_by, shared_with, editing_permission) VALUES($1, $2, $3, $4) RETURNING share_id',
            [id, req.user.id, targetRecipient.rows[0].user_id, canEdit]
        );
        if (sharedNote.rows.length === 0) {
            return res.json('Failed to execute request');
        }
        res.json('Successfully shared the note');
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.post('/remove-share/:id', authorization, upload.none(), async (req, res) => {
    const { id } = req.params;
    const { sharee } = req.body; //to je email
    try {
        //preveri še če uporabnik obstaja in dobi user_id
        const targetUser = await pool.query('SELECT user_id FROM t_users WHERE user_email=$1', [sharee]);
        if (targetUser.rows.length === 0) {
            return res.json('Failed to remove permissions');
        }

        const removedAccess = await pool.query('DELETE FROM t_shared_notes WHERE note_id=$1 AND shared_by=$2 AND shared_with=$3', [
            id,
            req.user.id,
            targetUser.rows[0].user_id,
        ]);
        if (removedAccess.rowCount === 0) {
            return res.json('Failed to remove permissions');
        }
        res.json('Successfully removed permissions for this note');
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

router.get('/individual-note/:id', authorization, upload.none(), async (req, res) => {
    const { id } = req.params;
    try {
        const notes = await pool.query(
            `
            SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, 0 AS editing_permission, null AS shared_by_email, tn.note_version
            FROM t_notes tn
            WHERE tn.user_id = $1 AND tn.note_id = $2
            
            UNION
            
            SELECT tn.note_id, tn.title, tn.content, tn.subject, tn.last_update, sn.editing_permission, t_users_shared_by.user_email AS shared_by_email, tn.note_version
            FROM t_notes tn
            INNER JOIN t_shared_notes sn ON tn.note_id = sn.note_id
            INNER JOIN t_users t_users_shared_by ON sn.shared_by = t_users_shared_by.user_id
            INNER JOIN t_users t_users_shared_with ON sn.shared_with = t_users_shared_with.user_id
            WHERE t_users_shared_with.user_id = $1 AND sn.note_id = $2;
        `,
            [req.user.id, id]
        );

        let finalNotes = notes.rows.map((note) => {
            note.last_update = transformToReadableDate(note.last_update);
            return note;
        });

        //presigned url
        finalNotes = await Promise.all(
            finalNotes.map(async (note) => {
                const attachments = await pool.query(
                    'SELECT attachment_id, file_name, file_original_name, null AS url, file_extension FROM t_attachments WHERE note_id=$1',
                    [note.note_id]
                );

                if (attachments.rows.length > 0) {
                    let atts = await Promise.all(
                        attachments.rows.map(async (attachment) => {
                            const getObjectParams = {
                                Bucket: bucketName,
                                Key: attachment.file_name,
                            };
                            const command = new GetObjectCommand(getObjectParams);
                            const url = await getSignedUrl(s3, command, { expiresIn: FILE_EXPIRATION_TIME });
                            attachment.url = url;
                            return attachment;
                        })
                    );
                    return { ...note, attachments: atts };
                } else {
                    return note;
                }
            })
        );
        res.json(finalNotes);
    } catch (error) {
        console.log(error.message);
        res.status(500).json('Server Error');
    }
});

//error handling za multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.json({ msg: 'File(s) too large' });
        }
    }
});

module.exports = router;
