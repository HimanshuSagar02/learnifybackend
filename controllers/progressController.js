import Progress from "../models/progress.js";

// update when user watches lecture
export const updateProgress = async(req,res)=>{
    try{
        const {userId,courseId,lectureId,totalLectures} = req.body;

        let progress = await Progress.findOne({userId,courseId});

        // new entry
        if(!progress){
            progress = new Progress({
                userId, courseId,
                watchedLectures:[lectureId]
            });
        } 
        // push lecture only if not exists
        else if(!progress.watchedLectures.includes(lectureId)){
            progress.watchedLectures.push(lectureId);
        } else {
            // Already watched this lecture
            progress.completion = Math.round((progress.watchedLectures.length / totalLectures)*100);
            await progress.save();
            return res.json({
                success: true,
                completion: progress.completion,
                message: "Progress already recorded for this lecture",
                alreadyWatched: true
            });
        }

        progress.completion = Math.round((progress.watchedLectures.length / totalLectures)*100);
        await progress.save();

        res.json({
            success: true,
            completion: progress.completion,
            message: "Progress updated successfully",
            alreadyWatched: false
        });

    }catch(err){
        res.status(500).json({err:"Update failed",details:err});
    }
}

// get saved progress
export const getProgress = async(req,res)=>{
    try{
        const {userId,courseId} = req.params;

        const record = await Progress.findOne({userId,courseId});
        res.json({completion: record?.completion || 0});

    }catch(err){
        res.status(500).json({message:"Fetch fail",err});
    }
}
