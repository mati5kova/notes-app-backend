const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const uuid = require('uuid').v4;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../uploads/');
    },
    filename: (req, file, cb) => {
        const { originalname } = file;
        cb(null, `${uuid()}-${originalname}`);
    },
});

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_BUCKET_REGION;

const s3 = new S3Client({
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        bucketName: bucketName,
    },
    region: bucketRegion,
});

exports.s3Uploadv2 = async (file) => {
    const param = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `uploads/${uuid()}-${file.originalname}`,
        Body: file.buffer,
    };
    s3.upload();
};
