
import { Model, Types } from 'mongoose';
import { Injectable, Patch } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat, CatDocument } from './schemas/cat.schema';
import { CreateCatDto } from './dto/create-cat.dto';
import { UpdateCatDto } from './dto/update-cat.dto';

@Injectable()
export class CatsService {

  constructor(@InjectModel(Cat.name) private catModel: Model<CatDocument>) { }

  async create(createCatDto: CreateCatDto): Promise<Cat> {
    const createdCat: CatDocument = new this.catModel(createCatDto);
    // Add validation
    return createdCat.save();
  }

  async findAll(): Promise<Cat[]> {
    return this.catModel.find().exec();
  }

  async findOne(id: string): Promise<Cat> {
    return this.catModel.findById(id).exec();
  }  
  
  async remove(id: string): Promise<Boolean> {
    return this.catModel.remove({_id: id}).exec()
      .then(res => res.deletedCount == 1);
  }

  async update(id: string, updateCatDto: UpdateCatDto) {
    return this.catModel.findById(id)
      .then(res => this.patch(res, new this.catModel(updateCatDto)))
      .then(res => this.catModel.updateOne({_id: id}, res));
  }

  patch(origin: Cat, updateCat: CatDocument): Cat {
    Cat.UPDATE_PROPERTIES.forEach(key => {
      if (updateCat[key] != undefined) {
        origin[key] = updateCat[key];
      }
    });
    return origin;
  }
}